/**
 * Gmail access for Harmonious staff. Server-only.
 *
 * Two paths:
 * - Per-employee: each staff member connects their own Google inbox via the
 *   google_mail App User Connector; calls go through callAsAppUser with that
 *   user's encrypted connection key.
 * - Group mailboxes: shared Google accounts (e.g. ops@) linked through the
 *   standard Gmail connector; the connection key lives in a project env var
 *   named by staff_group_mailboxes.env_key.
 *
 * Email content is fetched on demand and never persisted.
 */
import { appUserReconnectRequired, callAsAppUser } from "@/integrations/lovable/appUserConnector";
import { getConnectionKeyForUser } from "@/lib/app-user-connections.server";
import { STAFF_ROLE_SET } from "@/lib/staff-directory.server";

export const GMAIL_CONNECTOR_ID = "google_mail";
export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

export const GOOGLE_MAIL_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
];

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

/** Throw unless the user holds a Harmonious staff role. */
export async function requireStaff(userId: string) {
  const db = await admin();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId).in("role", STAFF_ROLE_SET);
  if (!(data ?? []).length) throw new Error("Only Harmonious staff can use staff mailboxes.");
}

const LEADER_ROLES = ["super_admin", "executive", "admin"];

export async function requireStaffLeader(userId: string) {
  const db = await admin();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId).in("role", LEADER_ROLES);
  if (!(data ?? []).length) throw new Error("Only leadership can manage group mailboxes.");
}

// --- RFC 2822 helpers -------------------------------------------------------

const b64 = (s: string) =>
  Buffer.from(s, "utf8").toString("base64");
const mimeHeader = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);

export function createRawEmail(opts: { to: string; subject: string; body: string; from?: string }): string {
  const lines = [
    `To: ${opts.to}`,
    ...(opts.from ? [`From: ${opts.from}`] : []),
    `Subject: ${mimeHeader(opts.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    opts.body,
  ];
  return b64(lines.join("\r\n")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// --- Per-employee Gmail ------------------------------------------------------

export type GmailStatus =
  | { connected: true; email: string }
  | { connected: false; reconnectRequired?: boolean };

export async function gmailStatusForUser(userId: string): Promise<GmailStatus> {
  const key = await getConnectionKeyForUser(userId, GMAIL_CONNECTOR_ID);
  if (!key) return { connected: false };
  const res = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey: key,
    connectorId: GMAIL_CONNECTOR_ID,
    path: "/gmail/v1/users/me/profile",
    requiredScopes: GOOGLE_MAIL_SCOPES,
  });
  if (await appUserReconnectRequired(res)) return { connected: false, reconnectRequired: true };
  if (!res.ok) {
    console.error(`Gmail profile failed [${res.status}]: ${await res.text()}`);
    return { connected: false };
  }
  const profile = (await res.json()) as { emailAddress?: string };
  return { connected: true, email: profile.emailAddress ?? "" };
}

/** Send an email from the employee's own Gmail. Returns the Gmail message id. */
export async function sendGmailAsUser(userId: string, opts: { to: string; subject: string; body: string }): Promise<string | null> {
  const key = await getConnectionKeyForUser(userId, GMAIL_CONNECTOR_ID);
  if (!key) return null;
  const res = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey: key,
    connectorId: GMAIL_CONNECTOR_ID,
    path: "/gmail/v1/users/me/messages/send",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: createRawEmail(opts) }),
    },
    requiredScopes: GOOGLE_MAIL_SCOPES,
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Gmail send failed [${res.status}]: ${text}`);
    throw new Error("The email couldn't be sent from your Google inbox. Try reconnecting it.");
  }
  const body = (await res.json()) as { id?: string };
  return body.id ?? null;
}

export interface GmailThreadRow {
  id: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
}

/** Recent threads with a given email address (or overall), read-only, never stored. */
export async function listGmailThreadsForUser(userId: string, query?: string): Promise<GmailThreadRow[] | null> {
  const key = await getConnectionKeyForUser(userId, GMAIL_CONNECTOR_ID);
  if (!key) return null;
  const q = query ? `from:${query} OR to:${query}` : "in:inbox";
  const list = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey: key,
    connectorId: GMAIL_CONNECTOR_ID,
    path: `/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent(q)}`,
    requiredScopes: GOOGLE_MAIL_SCOPES,
  });
  if (!list.ok) {
    console.error(`Gmail list failed [${list.status}]: ${await list.text()}`);
    return null;
  }
  const listed = (await list.json()) as { messages?: { id: string }[] };
  const ids = (listed.messages ?? []).slice(0, 10);
  const rows: GmailThreadRow[] = [];
  for (const m of ids) {
    const got = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey: key,
      connectorId: GMAIL_CONNECTOR_ID,
      path: `/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      requiredScopes: GOOGLE_MAIL_SCOPES,
    });
    if (!got.ok) continue;
    const msg = (await got.json()) as { id: string; snippet?: string; payload?: { headers?: { name: string; value: string }[] } };
    const h = new Map((msg.payload?.headers ?? []).map((x) => [x.name.toLowerCase(), x.value]));
    rows.push({ id: msg.id, snippet: msg.snippet ?? "", subject: h.get("subject") ?? "(no subject)", from: h.get("from") ?? "", date: h.get("date") ?? "" });
  }
  return rows;
}

// --- Group mailboxes ----------------------------------------------------------

export interface GroupMailbox {
  id: string;
  label: string;
  envKey: string;
  emailAddress: string | null;
  connectedBy: string;
  createdAt: string;
}

export async function listGroupMailboxes(): Promise<GroupMailbox[]> {
  const db = await admin();
  const { data, error } = await db.from("staff_group_mailboxes").select("*").order("created_at");
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    label: r.label,
    envKey: r.env_key,
    emailAddress: r.email_address ?? null,
    connectedBy: r.connected_by,
    createdAt: r.created_at,
  }));
}

function groupKey(envKey: string): string {
  if (!/^GOOGLE_MAIL_API_KEY(_\d+)?$/.test(envKey)) throw new Error("Unknown mailbox connection.");
  const key = process.env[envKey];
  if (!key) throw new Error("This mailbox connection isn't linked to the project yet.");
  return key;
}

export async function groupCall(envKey: string, path: string, init?: RequestInit): Promise<Response> {
  const lovable = process.env["LOVABLE_API_KEY"];
  if (!lovable) throw new Error("LOVABLE_API_KEY is not configured");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${lovable}`);
  headers.set("X-Connection-Api-Key", groupKey(envKey));
  return fetch(`${GATEWAY_BASE_URL}/${GMAIL_CONNECTOR_ID}${path}`, { ...init, headers });
}

/** Register a linked Gmail connection as a named group mailbox (leadership only). */
export async function registerGroupMailbox(userId: string, label: string, envKey: string) {
  await requireStaffLeader(userId);
  const res = await groupCall(envKey, "/gmail/v1/users/me/profile");
  if (!res.ok) {
    const text = await res.text();
    console.error(`Group mailbox profile failed [${res.status}]: ${text}`);
    throw new Error("That Google connection couldn't be reached. Check it in connector settings.");
  }
  const profile = (await res.json()) as { emailAddress?: string };
  const db = await admin();
  const { error } = await db.from("staff_group_mailboxes").insert({
    label: label.trim(),
    env_key: envKey,
    email_address: profile.emailAddress ?? null,
    connected_by: userId,
  });
  if (error) throw error;
}

export async function removeGroupMailbox(userId: string, id: string) {
  await requireStaffLeader(userId);
  const db = await admin();
  const { error } = await db.from("staff_group_mailboxes").delete().eq("id", id);
  if (error) throw error;
}

/** Send from a group mailbox as a staff member; the sender is logged by the caller. */
export async function sendFromGroupMailbox(userId: string, mailboxId: string, opts: { to: string; subject: string; body: string }) {
  await requireStaff(userId);
  const boxes = await listGroupMailboxes();
  const box = boxes.find((b) => b.id === mailboxId);
  if (!box) throw new Error("Mailbox not found.");
  const res = await groupCall(box.envKey, "/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw: createRawEmail(opts) }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Group mailbox send failed [${res.status}]: ${text}`);
    throw new Error("The email couldn't be sent from that mailbox. Please try again.");
  }
  const { logActivity } = await import("@/lib/staff-directory.server");
  await logActivity(userId, "action", "/ops/mailboxes", `Sent from ${box.label} to ${opts.to}`).catch(() => {});
}

export async function listGroupMailboxThreads(userId: string, mailboxId: string): Promise<GmailThreadRow[]> {
  await requireStaff(userId);
  const boxes = await listGroupMailboxes();
  const box = boxes.find((b) => b.id === mailboxId);
  if (!box) throw new Error("Mailbox not found.");
  const list = await groupCall(box.envKey, "/gmail/v1/users/me/messages?maxResults=10&labelIds=INBOX");
  if (!list.ok) {
    console.error(`Group mailbox list failed [${list.status}]: ${await list.text()}`);
    throw new Error("Couldn't load that mailbox. Please try again.");
  }
  const listed = (await list.json()) as { messages?: { id: string }[] };
  const rows: GmailThreadRow[] = [];
  for (const m of (listed.messages ?? []).slice(0, 10)) {
    const got = await groupCall(box.envKey, `/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
    if (!got.ok) continue;
    const msg = (await got.json()) as { id: string; snippet?: string; payload?: { headers?: { name: string; value: string }[] } };
    const h = new Map((msg.payload?.headers ?? []).map((x) => [x.name.toLowerCase(), x.value]));
    rows.push({ id: msg.id, snippet: msg.snippet ?? "", subject: h.get("subject") ?? "(no subject)", from: h.get("from") ?? "", date: h.get("date") ?? "" });
  }
  return rows;
}
