/**
 * Full mailbox engine for staff inboxes (personal Google inbox or a group mailbox).
 * Server-only. Content is fetched on demand from Gmail and never stored; only
 * ticket metadata for group mailboxes is persisted (mail_tickets).
 */
import { callAsAppUser, appUserReconnectRequired } from "@/integrations/lovable/appUserConnector";
import { getConnectionKeyForUser } from "@/lib/app-user-connections.server";
import { GATEWAY_BASE_URL, GMAIL_CONNECTOR_ID, GOOGLE_MAIL_SCOPES, groupCall, listGroupMailboxes, requireStaff } from "@/lib/gmail.server";

type Caller = (path: string, init?: RequestInit) => Promise<Response>;
export type MailboxRef = "me" | string; // "me" = caller's own Google inbox, else group mailbox id
export type Folder = "inbox" | "sent" | "drafts" | "archive" | "trash" | "starred";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

export async function resolveMailbox(userId: string, ref: MailboxRef): Promise<{ call: Caller; group: { id: string; email: string | null } | null }> {
  await requireStaff(userId);
  if (ref === "me") {
    const key = await getConnectionKeyForUser(userId, GMAIL_CONNECTOR_ID);
    if (!key) throw new Error("Connect your Google inbox on the Mailboxes page first.");
    const call: Caller = async (path, init) => {
      const res = await callAsAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: key, connectorId: GMAIL_CONNECTOR_ID, path, ...(init ? { init } : {}), requiredScopes: GOOGLE_MAIL_SCOPES });
      if (await appUserReconnectRequired(res)) throw new Error("Your Google access needs to be renewed — reconnect on the Mailboxes page.");
      return res;
    };
    return { call, group: null };
  }
  const box = (await listGroupMailboxes()).find((b) => b.id === ref);
  if (!box) throw new Error("Mailbox not found.");
  return { call: (path, init) => groupCall(box.envKey, path, init), group: { id: box.id, email: box.emailAddress } };
}

async function ok(res: Response, what: string) {
  if (!res.ok) {
    const t = await res.text();
    console.error(`Gmail ${what} failed [${res.status}]: ${t}`);
    throw new Error(`Gmail ${what} failed (${res.status}).`);
  }
  return res;
}

// --- Batch helper -----------------------------------------------------------

async function batchGet(call: Caller, paths: string[]): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < paths.length; i += 10) {
    const chunk = paths.slice(i, i + 10);
    const boundary = `b${crypto.randomUUID().replace(/-/g, "")}`;
    const body = chunk.map((p, j) => `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <i${j}>\r\n\r\nGET ${p}\r\n\r\n`).join("") + `--${boundary}--`;
    const res = await ok(await call("/batch/gmail/v1", { method: "POST", headers: { "Content-Type": `multipart/mixed; boundary=${boundary}` }, body }), "batch");
    const ct = res.headers.get("content-type") ?? "";
    const m = /boundary="?([^";]+)"?/i.exec(ct);
    if (!/multipart\/mixed/i.test(ct) || !m) throw new Error("Gmail batch returned an unexpected response.");
    const text = await res.text();
    const parts = text.split(`--${m[1]}`).slice(1).filter((p) => !p.startsWith("--"));
    const results: any[] = new Array(chunk.length).fill(null);
    parts.forEach((part, idx) => {
      const id = /Content-ID:\s*<response-i(\d+)>/i.exec(part);
      const status = /HTTP\/[\d.]+\s+(\d{3})/.exec(part);
      const jsonStart = part.indexOf("{");
      const n = id ? Number(id[1]) : idx;
      if (!status || Number(status[1]) >= 300 || jsonStart < 0) {
        console.error(`Gmail batch part ${n} failed: ${part.slice(0, 300)}`);
        return;
      }
      try { results[n] = JSON.parse(part.slice(jsonStart, part.lastIndexOf("}") + 1)); } catch { /* skip */ }
    });
    out.push(...results);
  }
  return out;
}

// --- Parsing ------------------------------------------------------------------

const hdr = (headers: { name: string; value: string }[] | undefined, name: string) =>
  (headers ?? []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
const decode = (data?: string) => (data ? Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "");
const stripHtml = (h: string) =>
  h.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, "\n\n").trim();

function bodyOf(payload: any): string {
  let plain = "", html = "";
  const walk = (p: any) => {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body?.data && !plain) plain = decode(p.body.data);
    else if (p.mimeType === "text/html" && p.body?.data && !html) html = decode(p.body.data);
    (p.parts ?? []).forEach(walk);
  };
  walk(payload);
  return plain || stripHtml(html);
}
const emailOf = (from: string) => (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();

export interface ThreadSummary { id: string; subject: string; from: string; snippet: string; date: string; unread: boolean; count: number; labels: string[]; draftId?: string }

// --- Reads ------------------------------------------------------------------

const FOLDER_QUERY: Record<Exclude<Folder, "drafts">, string> = {
  inbox: "labelIds=INBOX",
  sent: "labelIds=SENT",
  starred: "labelIds=STARRED",
  trash: "labelIds=TRASH&includeSpamTrash=true",
  archive: `q=${encodeURIComponent("-in:inbox -in:trash -in:spam -in:sent -in:draft")}`,
};

export async function listThreads(call: Caller, folder: Folder, search?: string, pageToken?: string) {
  if (folder === "drafts") {
    const res = await ok(await call(`/gmail/v1/users/me/drafts?maxResults=25${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`), "drafts list");
    const j = (await res.json()) as { drafts?: { id: string; message: { id: string; threadId: string } }[]; nextPageToken?: string };
    const drafts = j.drafts ?? [];
    const full = await batchGet(call, drafts.map((d) => `/gmail/v1/users/me/drafts/${d.id}?format=metadata`));
    return {
      nextPageToken: j.nextPageToken ?? null,
      threads: full.map((d, i): ThreadSummary | null => d ? ({
        id: drafts[i]!.message.threadId, draftId: drafts[i]!.id,
        subject: hdr(d.message?.payload?.headers, "Subject") || "(no subject)", from: `To: ${hdr(d.message?.payload?.headers, "To")}`,
        snippet: d.message?.snippet ?? "", date: hdr(d.message?.payload?.headers, "Date"), unread: false, count: 1, labels: d.message?.labelIds ?? [],
      }) : null).filter(Boolean) as ThreadSummary[],
    };
  }
  let qs = FOLDER_QUERY[folder];
  if (search?.trim()) qs += `${qs.startsWith("q=") ? "+" : "&q="}${encodeURIComponent(search.trim())}`;
  const res = await ok(await call(`/gmail/v1/users/me/threads?maxResults=25&${qs}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`), "list");
  const j = (await res.json()) as { threads?: { id: string }[]; nextPageToken?: string };
  const ids = (j.threads ?? []).map((t) => t.id);
  const meta = await batchGet(call, ids.map((id) => `/gmail/v1/users/me/threads/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=To`));
  const threads = meta.map((t): ThreadSummary | null => {
    if (!t?.messages?.length) return null;
    const first = t.messages[0], last = t.messages[t.messages.length - 1];
    const labels = [...new Set<string>(t.messages.flatMap((m: any) => m.labelIds ?? []))];
    return {
      id: t.id, subject: hdr(first.payload?.headers, "Subject") || "(no subject)",
      from: folder === "sent" ? `To: ${hdr(last.payload?.headers, "To")}` : hdr(last.payload?.headers, "From"),
      snippet: last.snippet ?? "", date: hdr(last.payload?.headers, "Date"), unread: labels.includes("UNREAD"), count: t.messages.length, labels,
    };
  }).filter(Boolean) as ThreadSummary[];
  return { threads, nextPageToken: j.nextPageToken ?? null };
}

export async function getThread(call: Caller, threadId: string) {
  const res = await ok(await call(`/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`), "thread");
  const t = (await res.json()) as any;
  const messages = (t.messages ?? []).map((m: any) => ({
    id: m.id,
    from: hdr(m.payload?.headers, "From"), to: hdr(m.payload?.headers, "To"), cc: hdr(m.payload?.headers, "Cc"),
    subject: hdr(m.payload?.headers, "Subject"), date: hdr(m.payload?.headers, "Date"),
    messageId: hdr(m.payload?.headers, "Message-ID") || hdr(m.payload?.headers, "Message-Id"),
    references: hdr(m.payload?.headers, "References"),
    body: bodyOf(m.payload), labels: (m.labelIds ?? []) as string[],
  }));
  // Opening a thread marks it read.
  if (messages.some((m: any) => m.labels.includes("UNREAD"))) {
    await call(`/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}/modify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ removeLabelIds: ["UNREAD"] }) }).catch(() => undefined);
  }
  return { id: t.id as string, messages };
}

// --- Writes -------------------------------------------------------------------

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const mimeHeader = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);
const clean = (v: string) => v.replace(/[\r\n]+/g, " ").trim();

export interface Outgoing { to: string; cc?: string | undefined; subject: string; body: string; threadId?: string | undefined; inReplyTo?: string | undefined; references?: string | undefined }

function raw(o: Outgoing): string {
  const lines = [
    `To: ${clean(o.to)}`,
    ...(o.cc?.trim() ? [`Cc: ${clean(o.cc)}`] : []),
    `Subject: ${mimeHeader(clean(o.subject))}`,
    ...(o.inReplyTo ? [`In-Reply-To: ${clean(o.inReplyTo)}`, `References: ${clean(`${o.references ?? ""} ${o.inReplyTo}`)}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    o.body,
  ];
  return b64(lines.join("\r\n")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const msg = (o: Outgoing) => ({ raw: raw(o), ...(o.threadId ? { threadId: o.threadId } : {}) });
const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export async function sendMail(call: Caller, o: Outgoing) {
  const res = await ok(await call("/gmail/v1/users/me/messages/send", json(msg(o))), "send");
  return (await res.json()) as { id: string; threadId: string };
}

export async function saveDraft(call: Caller, o: Outgoing, draftId?: string) {
  const res = draftId
    ? await call(`/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}`, { ...json({ id: draftId, message: msg(o) }), method: "PUT" })
    : await call("/gmail/v1/users/me/drafts", json({ message: msg(o) }));
  await ok(res, "save draft");
  return (await res.json()) as { id: string };
}

export async function getDraft(call: Caller, draftId: string) {
  const res = await ok(await call(`/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}?format=full`), "draft");
  const d = (await res.json()) as any;
  const h = d.message?.payload?.headers;
  return { id: d.id as string, threadId: d.message?.threadId as string, to: hdr(h, "To"), cc: hdr(h, "Cc"), subject: hdr(h, "Subject"), body: bodyOf(d.message?.payload), inReplyTo: hdr(h, "In-Reply-To"), references: hdr(h, "References") };
}

export async function sendDraft(call: Caller, draftId: string) {
  await ok(await call("/gmail/v1/users/me/drafts/send", json({ id: draftId })), "send draft");
}

export async function deleteDraft(call: Caller, draftId: string) {
  await ok(await call(`/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}`, { method: "DELETE" }), "discard draft");
}

export type ThreadAction = "archive" | "inbox" | "trash" | "untrash" | "read" | "unread" | "star" | "unstar";

export async function threadAction(call: Caller, threadId: string, action: ThreadAction) {
  const id = encodeURIComponent(threadId);
  if (action === "trash" || action === "untrash") return void (await ok(await call(`/gmail/v1/users/me/threads/${id}/${action}`, { method: "POST" }), action));
  const mod: Record<string, { addLabelIds?: string[]; removeLabelIds?: string[] }> = {
    archive: { removeLabelIds: ["INBOX"] }, inbox: { addLabelIds: ["INBOX"] },
    read: { removeLabelIds: ["UNREAD"] }, unread: { addLabelIds: ["UNREAD"] },
    star: { addLabelIds: ["STARRED"] }, unstar: { removeLabelIds: ["STARRED"] },
  };
  await ok(await call(`/gmail/v1/users/me/threads/${id}/modify`, json(mod[action])), action);
}

// --- Group-mailbox tickets ------------------------------------------------------

/** Find the staff member assigned to the client a sender belongs to. */
async function autoAssignee(db: any, fromEmail: string): Promise<{ clientId: string | null; userId: string | null }> {
  if (!fromEmail) return { clientId: null, userId: null };
  const { data: contact } = await db.from("client_contacts").select("client_id").ilike("email", fromEmail).is("deactivated_at", null).limit(1).maybeSingle();
  let clientId: string | null = contact?.client_id ?? null;
  if (!clientId) {
    const { data: c } = await db.from("clients").select("id").or(`primary_contact_email.ilike.${fromEmail},billing_contact_email.ilike.${fromEmail}`).limit(1).maybeSingle();
    clientId = c?.id ?? null;
  }
  if (!clientId) return { clientId: null, userId: null };
  const { data: team } = await db.from("client_team_assignments").select("user_id, team_role").eq("client_id", clientId);
  const rank = ["account_manager", "lead", "operations"];
  const sorted = ((team ?? []) as any[]).sort((a, b) => (rank.indexOf(a.team_role) + 99) % 99 - (rank.indexOf(b.team_role) + 99) % 99);
  let userId: string | null = sorted[0]?.user_id ?? null;
  if (!userId) {
    const { data: a } = await db.from("client_assignments").select("staff_user_id").eq("client_id", clientId).limit(1).maybeSingle();
    userId = a?.staff_user_id ?? null;
  }
  return { clientId, userId };
}

/** Create tickets for new inbound threads in a group mailbox; auto-assign to the client's staff. */
export async function syncTickets(mailboxId: string, mailboxEmail: string | null, threads: ThreadSummary[]) {
  if (!threads.length) return;
  const db = await admin();
  const { data: existing } = await db.from("mail_tickets").select("id, thread_id, status, last_message_at").eq("mailbox_id", mailboxId).in("thread_id", threads.map((t) => t.id));
  const have = new Map(((existing ?? []) as any[]).map((r) => [r.thread_id, r]));
  for (const t of threads) {
    const at = t.date && !Number.isNaN(Date.parse(t.date)) ? new Date(t.date).toISOString() : null;
    const row = have.get(t.id);
    if (row) {
      // New mail on a resolved ticket reopens it.
      if (at && row.last_message_at && at > row.last_message_at) {
        const sender = emailOf(t.from);
        const inbound = !mailboxEmail || sender !== mailboxEmail.toLowerCase();
        const patch: any = { last_message_at: at, updated_at: new Date().toISOString() };
        if (inbound && row.status === "resolved") { patch.status = "open"; patch.resolved_at = null; }
        await db.from("mail_tickets").update(patch).eq("id", row.id);
        if (patch.status) await db.from("mail_ticket_events").insert({ ticket_id: row.id, kind: "reopened", detail: { reason: "new message" } });
      }
      continue;
    }
    const from = emailOf(t.from);
    const { clientId, userId } = await autoAssignee(db, from);
    const { data: created, error } = await db.from("mail_tickets").insert({
      mailbox_id: mailboxId, thread_id: t.id, subject: t.subject.slice(0, 500), from_email: from || null, client_id: clientId,
      assignee_user_id: userId, assigned_how: userId ? "auto" : null, last_message_at: at,
    }).select("id").maybeSingle();
    if (error || !created) continue; // concurrent insert
    await db.from("mail_ticket_events").insert({ ticket_id: created.id, kind: "created", detail: { from } });
    if (userId) await db.from("mail_ticket_events").insert({ ticket_id: created.id, kind: "assigned", detail: { to: userId, how: "auto", reason: "assigned client" } });
  }
}

export async function ticketsFor(mailboxId: string, threadIds: string[]) {
  if (!threadIds.length) return {};
  const db = await admin();
  const { data } = await db.from("mail_tickets").select("id, thread_id, status, assignee_user_id, assigned_how, client_id").eq("mailbox_id", mailboxId).in("thread_id", threadIds);
  const rows = (data ?? []) as any[];
  const names = await staffNames(db, rows.map((r) => r.assignee_user_id).filter(Boolean));
  return Object.fromEntries(rows.map((r) => [r.thread_id, { id: r.id, status: r.status, assigneeId: r.assignee_user_id, assignee: r.assignee_user_id ? names.get(r.assignee_user_id) ?? "Staff member" : null, how: r.assigned_how }]));
}

async function staffNames(db: any, ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return new Map();
  const { data } = await db.from("profiles").select("user_id, legal_name, email").in("user_id", uniq);
  return new Map(((data ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email || "Staff member"]));
}

export async function ticketDetail(mailboxId: string, threadId: string) {
  const db = await admin();
  const { data: t } = await db.from("mail_tickets").select("*").eq("mailbox_id", mailboxId).eq("thread_id", threadId).maybeSingle();
  if (!t) return null;
  const [{ data: ev }, { data: client }] = await Promise.all([
    db.from("mail_ticket_events").select("id, actor_user_id, kind, detail, created_at").eq("ticket_id", t.id).order("created_at"),
    t.client_id ? db.from("clients").select("name").eq("id", t.client_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const events = (ev ?? []) as any[];
  const names = await staffNames(db, [t.assignee_user_id, ...events.map((e) => e.actor_user_id), ...events.map((e) => e.detail?.to)].filter(Boolean));
  return {
    id: t.id as string, status: t.status as string, assigneeId: t.assignee_user_id as string | null,
    assignee: t.assignee_user_id ? names.get(t.assignee_user_id) ?? "Staff member" : null, how: t.assigned_how as string | null,
    client: (client as any)?.name ?? null, createdAt: t.created_at as string, resolvedAt: t.resolved_at as string | null,
    events: events.map((e) => ({ id: e.id, kind: e.kind, at: e.created_at, actor: e.actor_user_id ? names.get(e.actor_user_id) ?? "Staff member" : "System", detail: e.detail?.to ? { ...e.detail, toName: names.get(e.detail.to) ?? "Staff member" } : e.detail })),
  };
}

const LEADERS = ["super_admin", "executive", "admin", "operations"];

export async function updateTicket(actor: string, ticketId: string, patch: { assigneeId?: string | null | undefined; status?: "open" | "in_progress" | "waiting" | "resolved" | undefined; note?: string | undefined }) {
  await requireStaff(actor);
  const db = await admin();
  const { data: t } = await db.from("mail_tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!t) throw new Error("Ticket not found.");
  const { data: roles } = await db.from("user_roles").select("role").eq("user_id", actor);
  const leader = ((roles ?? []) as any[]).some((r) => LEADERS.includes(r.role));
  const mine = t.assignee_user_id === actor;
  const update: any = { updated_at: new Date().toISOString() };
  const events: any[] = [];
  if (patch.assigneeId !== undefined && patch.assigneeId !== t.assignee_user_id) {
    const claimingUnassigned = !t.assignee_user_id && patch.assigneeId === actor;
    if (!leader && !mine && !claimingUnassigned) throw new Error("Only the assignee or an Operations lead can reassign this ticket.");
    if (patch.assigneeId) await requireStaff(patch.assigneeId).catch(() => { throw new Error("That person isn't Harmonious staff."); });
    update.assignee_user_id = patch.assigneeId;
    update.assigned_how = patch.assigneeId ? "manual" : null;
    events.push({ kind: patch.assigneeId ? "assigned" : "unassigned", detail: patch.assigneeId ? { to: patch.assigneeId, how: "manual" } : {} });
  }
  if (patch.status && patch.status !== t.status) {
    if (!leader && !mine && !(patch.assigneeId === actor)) throw new Error("Only the assignee or an Operations lead can change the status.");
    update.status = patch.status;
    update.resolved_at = patch.status === "resolved" ? new Date().toISOString() : null;
    events.push({ kind: "status", detail: { from: t.status, to: patch.status } });
  }
  if (patch.note?.trim()) events.push({ kind: "note", detail: { text: patch.note.trim().slice(0, 2000) } });
  if (!events.length) return;
  if (Object.keys(update).length > 1) { const { error } = await db.from("mail_tickets").update(update).eq("id", ticketId); if (error) throw error; }
  const { error } = await db.from("mail_ticket_events").insert(events.map((e) => ({ ...e, ticket_id: ticketId, actor_user_id: actor })));
  if (error) throw error;
}

export async function recordReply(actor: string, mailboxId: string, threadId: string) {
  const db = await admin();
  const { data: t } = await db.from("mail_tickets").select("id, status").eq("mailbox_id", mailboxId).eq("thread_id", threadId).maybeSingle();
  if (!t) return;
  await db.from("mail_ticket_events").insert({ ticket_id: t.id, actor_user_id: actor, kind: "replied", detail: {} });
  if (t.status === "open") {
    await db.from("mail_tickets").update({ status: "in_progress", updated_at: new Date().toISOString() }).eq("id", t.id);
    await db.from("mail_ticket_events").insert({ ticket_id: t.id, actor_user_id: actor, kind: "status", detail: { from: "open", to: "in_progress" } });
  }
}

export async function ticketBoard(mailboxId: string | null) {
  const db = await admin();
  let b = db.from("mail_tickets").select("status, assignee_user_id, mailbox_id").neq("status", "resolved");
  if (mailboxId) b = b.eq("mailbox_id", mailboxId);
  const { data } = await b.limit(5000);
  const rows = (data ?? []) as any[];
  const names = await staffNames(db, rows.map((r) => r.assignee_user_id).filter(Boolean));
  const byStatus: Record<string, number> = { open: 0, in_progress: 0, waiting: 0 };
  const byAssignee: Record<string, number> = {};
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    const n = r.assignee_user_id ? names.get(r.assignee_user_id) ?? "Staff member" : "Unassigned";
    byAssignee[n] = (byAssignee[n] ?? 0) + 1;
  }
  return { byStatus, byAssignee };
}

export async function staffOptions() {
  const db = await admin();
  const { STAFF_ROLE_SET } = await import("@/lib/staff-directory.server");
  const { data } = await db.from("user_roles").select("user_id").in("role", STAFF_ROLE_SET);
  const ids = [...new Set(((data ?? []) as any[]).map((r) => r.user_id))];
  const names = await staffNames(db, ids);
  return ids.map((id) => ({ id, name: names.get(id) ?? "Staff member" })).sort((a, b) => a.name.localeCompare(b.name));
}
