/**
 * Marketing imports: ClickUp tasks → draft calendar items; HubSpot (each user's own
 * connection, read-only) → contacts, deals, email history and past marketing emails.
 * Server-only. Imported items always land as drafts (or as already-sent history) —
 * nothing imported can publish or send without the normal approval flow.
 */
import { requireMarketing } from "@/lib/marketing.server";
import { callAsAppUser, appUserReconnectRequired } from "@/integrations/lovable/appUserConnector";
import { getConnectionKeyForUser } from "@/lib/app-user-connections.server";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
export const HUBSPOT_CONNECTOR_ID = "hubspot";
export const HUBSPOT_SCOPES = [
  "crm.objects.contacts.read",
  "crm.objects.companies.read",
  "crm.objects.deals.read",
  "crm.objects.owners.read",
];
const HS_V = "2026-09";
const hs = {
  contacts: (after?: string) => `/crm/objects/${HS_V}/contacts?limit=100&properties=email,firstname,lastname,phone,company,jobtitle,hs_email_optout${after ? `&after=${after}` : ""}`,
  deals: (after?: string) => `/crm/objects/${HS_V}/deals?limit=100&properties=dealname,amount,closedate,hs_is_closed,hs_is_closed_won${after ? `&after=${after}` : ""}`,
  dealContacts: (id: string) => `/crm/objects/${HS_V}/deals/${id}/associations/contacts`,
  emails: (after?: string) => `/crm/objects/${HS_V}/emails?limit=100&properties=hs_email_subject,hs_email_direction,hs_timestamp,hs_email_text&associations=contacts${after ? `&after=${after}` : ""}`,
  marketingEmails: (offset = 0) => `/marketing/v3/emails?limit=100&offset=${offset}&includeStats=true`,
};

/* ---------------- ClickUp ---------------- */
const CU = "https://api.clickup.com/api/v2";
function cuKey() {
  const k = process.env["CLICKUP_API_KEY"];
  if (!k) throw new Error("ClickUp isn't connected yet — add the ClickUp API key first.");
  return k;
}
async function cu(path: string) {
  const res = await fetch(`${CU}${path}`, { headers: { Authorization: cuKey() } });
  if (!res.ok) throw new Error(`ClickUp request failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<any>;
}
export function clickupConfigured() { return !!process.env["CLICKUP_API_KEY"]; }

/** Workspaces → spaces → lists, for the picker. */
export async function clickupBrowse(userId: string) {
  await requireMarketing(userId);
  const { teams } = await cu("/team");
  const out: { team: string; spaces: { id: string; name: string; lists: { id: string; name: string }[] }[] }[] = [];
  for (const t of (teams ?? []).slice(0, 5)) {
    const { spaces } = await cu(`/team/${t.id}/space?archived=false`);
    const sp = [];
    for (const s of (spaces ?? []).slice(0, 30)) sp.push({ id: String(s.id), name: s.name, lists: await listsInSpace(String(s.id)) });
    out.push({ team: t.name, spaces: sp });
  }
  return out;
}
async function listsInSpace(spaceId: string) {
  const [{ folders }, { lists }] = await Promise.all([cu(`/space/${spaceId}/folder?archived=false`), cu(`/space/${spaceId}/list?archived=false`)]);
  const all = [...(lists ?? [])];
  for (const f of folders ?? []) for (const l of f.lists ?? []) all.push({ ...l, name: `${f.name} / ${l.name}` });
  return all.map((l: any) => ({ id: String(l.id), name: String(l.name) }));
}

function classify(task: any) {
  const tags = ((task.tags ?? []) as any[]).map((t) => String(t.name).toLowerCase());
  const text = `${tags.join(" ")} ${task.name}`.toLowerCase();
  const channels = (["linkedin", "facebook", "instagram"] as const).filter((c) => text.includes(c) || (c === "instagram" && /\big\b/.test(text)) || (c === "facebook" && /\bfb\b/.test(text)));
  const isEmail = tags.includes("email") || tags.includes("newsletter") || /\b(email|newsletter)\b/.test(task.name.toLowerCase());
  return { isEmail: isEmail && !channels.length, channels: [...channels] };
}

/** Every ClickUp task also becomes a Sales contact (one per task, keyed on the task id). Only name/email/tags are refreshed; consent and ownership are never overwritten. */
async function upsertClickupContact(db: any, t: any, body: string, actorId: string, r: any) {
  const email = (body.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null)?.toLowerCase() ?? null;
  const tags = ["clickup", ...((t.tags ?? []) as any[]).map((x) => String(x.name).toLowerCase())].slice(0, 20);
  const fields = { full_name: String(t.name).slice(0, 200), tags, updated_at: new Date().toISOString(), ...(email ? { email } : {}) };
  const { data: ex } = await db.from("crm_contacts").select("id").eq("external_source", "clickup").eq("external_id", String(t.id)).maybeSingle();
  if (ex) { await db.from("crm_contacts").update(fields).eq("id", ex.id); return; }
  const { error } = await db.from("crm_contacts").insert({ ...fields, scope: "harmonious", owner_user_id: actorId, created_by: actorId, source: "ClickUp", consent: "unknown", external_source: "clickup", external_id: String(t.id) });
  if (!error) r.contacts = (r.contacts ?? 0) + 1; else console.error("clickup contact", t.id, error.message);
}

async function importClickupSource(db: any, src: any, actorId: string) {
  const listIds = src.kind === "list" ? [src.ref_id] : (await listsInSpace(src.ref_id)).map((l) => l.id);
  const r = { tasks: 0, created: 0, updated: 0, skipped: 0, contacts: 0 };
  for (const listId of listIds) {
    for (let page = 0; page < 20; page++) {
      const { tasks, last_page } = await cu(`/list/${listId}/task?page=${page}&include_closed=true&subtasks=false`);
      for (const t of tasks ?? []) {
        r.tasks++;
        const at = t.due_date ? new Date(Number(t.due_date)).toISOString() : t.start_date ? new Date(Number(t.start_date)).toISOString() : null;
        const body = String(t.text_content ?? t.description ?? "").slice(0, 60000);
        const { isEmail, channels } = classify(t);
        await upsertClickupContact(db, t, body, actorId, r);
        const table = isEmail ? "marketing_emails" : "marketing_posts";
        const { data: existing } = await db.from(table).select("id, status").eq("external_source", "clickup").eq("external_id", String(t.id)).maybeSingle();
        if (existing && existing.status !== "draft") { r.skipped++; continue; }
        const row = isEmail
          ? { name: String(t.name).slice(0, 200), subject: String(t.name).slice(0, 200), blocks: body ? [{ type: "text", text: body }] : [], scheduled_at: at }
          : { title: String(t.name).slice(0, 200), body, channels, scheduled_at: at };
        if (existing) {
          await db.from(table).update({ ...row, external_url: t.url ?? null, updated_at: new Date().toISOString() }).eq("id", existing.id);
          r.updated++;
        } else {
          const { error } = await db.from(table).insert({ ...row, status: "draft", author_id: actorId, external_source: "clickup", external_id: String(t.id), external_url: t.url ?? null });
          if (error) { r.skipped++; continue; }
          r.created++;
        }
      }
      if (last_page !== false || !(tasks ?? []).length) break;
    }
  }
  await db.from("marketing_import_sources").update({ last_synced_at: new Date().toISOString(), last_result: r }).eq("id", src.id);
  await db.from("import_runs").insert({ provider: "clickup", actor_id: actorId, result: { source: src.name, ...r } });
  return r;
}

export async function listImportSources(userId: string) {
  const { db } = await requireMarketing(userId);
  const { data } = await db.from("marketing_import_sources").select("*").order("created_at", { ascending: false });
  return { sources: data ?? [], clickupReady: clickupConfigured() };
}

export async function addClickupSource(userId: string, d: { kind: "list" | "space"; refId: string; name: string; keepSyncing: boolean }) {
  const { db } = await requireMarketing(userId);
  const { data, error } = await db.from("marketing_import_sources")
    .upsert({ provider: "clickup", kind: d.kind, ref_id: d.refId, name: d.name, keep_syncing: d.keepSyncing, created_by: userId }, { onConflict: "provider,kind,ref_id" })
    .select("*").single();
  if (error) throw new Error(error.message);
  return importClickupSource(db, data, userId);
}

export async function runClickupSource(userId: string, id: string) {
  const { db } = await requireMarketing(userId);
  const { data } = await db.from("marketing_import_sources").select("*").eq("id", id).single();
  if (!data) throw new Error("Import source not found.");
  return importClickupSource(db, data, userId);
}

export async function updateImportSource(userId: string, id: string, patch: { keepSyncing?: boolean | undefined; remove?: boolean | undefined }) {
  const { db } = await requireMarketing(userId);
  if (patch.remove) await db.from("marketing_import_sources").delete().eq("id", id);
  else if (patch.keepSyncing !== undefined) await db.from("marketing_import_sources").update({ keep_syncing: patch.keepSyncing }).eq("id", id);
  return { ok: true };
}

/** Cron: re-sync "keep syncing" sources at most hourly. Only drafts are ever updated. */
export async function syncDueClickup() {
  if (!clickupConfigured()) return { synced: 0 };
  const db = await admin();
  const hourAgo = new Date(Date.now() - 3600e3).toISOString();
  const { data } = await db.from("marketing_import_sources").select("*").eq("keep_syncing", true).or(`last_synced_at.is.null,last_synced_at.lt.${hourAgo}`).limit(10);
  let synced = 0;
  for (const s of (data ?? []) as any[]) {
    try { await importClickupSource(db, s, s.created_by); synced++; } catch (e) { console.error("clickup sync", s.id, e); }
  }
  return { synced };
}

/* ---------------- HubSpot (per-user connection, else the shared portal connection) ---------------- */
class Reconnect extends Error {}
async function hsGet(key: string | null, path: string) {
  const res = key
    ? await callAsAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: key, connectorId: HUBSPOT_CONNECTOR_ID, path, requiredScopes: HUBSPOT_SCOPES })
    : await hsSharedGet(path);
  if (key && await appUserReconnectRequired(res)) throw new Reconnect("Your HubSpot access needs to be renewed.");
  if (!res.ok) {
    const body = await res.text();
    console.error(`HubSpot request failed [${res.status}]: ${body}`);
    throw new Error(`HubSpot request failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<any>;
}
async function hsSharedGet(path: string) {
  const lov = process.env["LOVABLE_API_KEY"];
  const hsKey = process.env["HUBSPOT_API_KEY"];
  if (!lov || !hsKey) throw new Error("HubSpot isn't connected — connect HubSpot on the Imports page first.");
  return fetch(`${GATEWAY_BASE_URL}/${HUBSPOT_CONNECTOR_ID}${path.startsWith("/") ? path : `/${path}`}`, {
    headers: { Authorization: `Bearer ${lov}`, "X-Connection-Api-Key": hsKey },
  });
}
export function hubspotSharedConfigured() { return !!process.env["HUBSPOT_API_KEY"]; }
async function* pages(key: string | null, mk: (after?: string) => string, max = 50) {
  let after: string | undefined;
  for (let i = 0; i < max; i++) {
    const j = await hsGet(key, mk(after));
    yield (j.results ?? []) as any[];
    after = j.paging?.next?.after;
    if (!after) break;
  }
}

export async function hubspotStatus(userId: string) {
  await requireMarketing(userId);
  const key = await getConnectionKeyForUser(userId, HUBSPOT_CONNECTOR_ID);
  const db = await admin();
  const { data: runs } = await db.from("import_runs").select("provider, result, created_at").order("created_at", { ascending: false }).limit(10);
  return { connected: !!key, configured: !!process.env["HUBSPOT_APP_USER_CONNECTOR_CLIENT_API_KEY"], runs: runs ?? [] };
}

export type HubspotPart = "contacts" | "deals" | "email_history" | "marketing_emails";

export async function importHubspot(userId: string, parts: HubspotPart[]) {
  const { db } = await requireMarketing(userId);
  const key = await getConnectionKeyForUser(userId, HUBSPOT_CONNECTOR_ID);
  if (!key) return { connected: false as const };
  const result: Record<string, any> = {};
  try {
    const contactIdByHs = new Map<string, string>();
    const needContacts = parts.includes("contacts") || parts.includes("deals") || parts.includes("email_history");
    if (needContacts) {
      let created = 0, updated = 0, unsub = 0;
      for await (const batch of pages(key, hs.contacts)) {
        for (const c of batch) {
          const p = c.properties ?? {};
          const name = [p.firstname, p.lastname].filter(Boolean).join(" ").trim() || p.email || "HubSpot contact";
          const optOut = String(p.hs_email_optout) === "true";
          const { data: ex } = await db.from("crm_contacts").select("id, consent").eq("external_source", "hubspot").eq("external_id", String(c.id)).maybeSingle();
          let rowId = ex?.id as string | undefined;
          if (!rowId && p.email) {
            const { data: byEmail } = await db.from("crm_contacts").select("id, consent").eq("scope", "harmonious").ilike("email", p.email).is("external_id", null).limit(1).maybeSingle();
            if (byEmail) { rowId = byEmail.id; await db.from("crm_contacts").update({ external_source: "hubspot", external_id: String(c.id) }).eq("id", rowId); }
          }
          const fields: any = { full_name: name.slice(0, 200), email: p.email || null, phone: p.phone || null, organization: p.company || null, title: p.jobtitle || null, updated_at: new Date().toISOString() };
          // An unsubscribe in either system wins; never re-subscribe someone.
          if (optOut) { fields.consent = "unsubscribed"; fields.consent_recorded_at = new Date().toISOString(); fields.consent_note = "Opted out in HubSpot"; unsub++; }
          if (parts.includes("contacts") || !rowId) {
            if (rowId) { await db.from("crm_contacts").update(fields).eq("id", rowId); updated++; }
            else {
              const { data: ins, error } = await db.from("crm_contacts").insert({ ...fields, scope: "harmonious", owner_user_id: userId, created_by: userId, source: "HubSpot", tags: ["hubspot"], consent: fields.consent ?? "unknown", external_source: "hubspot", external_id: String(c.id) }).select("id").single();
              if (error) continue;
              rowId = ins.id; created++;
            }
          }
          if (rowId) contactIdByHs.set(String(c.id), rowId);
        }
      }
      result["contacts"] = { created, updated, unsubscribed: unsub };
    }

    if (parts.includes("deals")) {
      let created = 0, updated = 0, noContact = 0;
      for await (const batch of pages(key, hs.deals, 10)) {
        for (const d of batch) {
          const p = d.properties ?? {};
          const assoc = await hsGet(key, hs.dealContacts(String(d.id))).catch(() => ({ results: [] }));
          const hsContact = (assoc.results ?? []).map((a: any) => String(a.toObjectId ?? a.id))[0];
          const contactId = hsContact ? contactIdByHs.get(hsContact) : undefined;
          if (!contactId) { noContact++; continue; }
          const stage = String(p.hs_is_closed_won) === "true" ? "won" : String(p.hs_is_closed) === "true" ? "lost" : "lead";
          const amt = p.amount ? Math.round(Number(p.amount) * 100) : null;
          const fields = { title: String(p.dealname || "HubSpot deal").slice(0, 200), amount_cents: amt && amt >= 0 ? amt : null, expected_close: p.closedate ? String(p.closedate).slice(0, 10) : null, updated_at: new Date().toISOString() };
          const { data: ex } = await db.from("crm_deals").select("id").eq("external_source", "hubspot").eq("external_id", String(d.id)).maybeSingle();
          if (ex) { await db.from("crm_deals").update(fields).eq("id", ex.id); updated++; }
          else {
            const { error } = await db.from("crm_deals").insert({ ...fields, stage, scope: "harmonious", contact_id: contactId, owner_user_id: userId, created_by: userId, connected_via: "hubspot", external_source: "hubspot", external_id: String(d.id) });
            if (!error) created++;
          }
        }
      }
      result["deals"] = { created, updated, skipped_without_contact: noContact };
    }

    if (parts.includes("email_history")) {
      let saved = 0;
      for await (const batch of pages(key, hs.emails, 20)) {
        const rows: any[] = [];
        for (const e of batch) {
          const p = e.properties ?? {};
          for (const a of e.associations?.contacts?.results ?? []) {
            const cid = contactIdByHs.get(String(a.id));
            if (!cid) continue;
            rows.push({ contact_id: cid, external_source: "hubspot", external_id: String(e.id), direction: p.hs_email_direction ?? null, subject: p.hs_email_subject ?? null, snippet: p.hs_email_text ? String(p.hs_email_text).slice(0, 500) : null, sent_at: p.hs_timestamp ?? null, imported_by: userId });
          }
        }
        if (rows.length) {
          const { error } = await db.from("crm_email_history").upsert(rows, { onConflict: "external_source,external_id,contact_id", ignoreDuplicates: true });
          if (!error) saved += rows.length;
        }
      }
      result["email_history"] = { saved };
    }

    if (parts.includes("marketing_emails")) {
      let created = 0, updated = 0;
      try {
        for (let offset = 0; offset < 2000; offset += 100) {
          const j = await hsGet(key, hs.marketingEmails(offset));
          const list = (j.results ?? []) as any[];
          for (const m of list) {
            const sentAt = m.publishDate ?? m.publishedAt ?? m.updatedAt ?? null;
            const stats = m.stats?.counters ?? m.stats ?? null;
            const fields = { name: String(m.name || m.subject || "HubSpot email").slice(0, 200), subject: String(m.subject || m.name || "").slice(0, 200), external_stats: stats, updated_at: new Date().toISOString() };
            const { data: ex } = await db.from("marketing_emails").select("id").eq("external_source", "hubspot").eq("external_id", String(m.id)).maybeSingle();
            if (ex) { await db.from("marketing_emails").update(fields).eq("id", ex.id); updated++; continue; }
            const published = ["PUBLISHED", "SENT"].includes(String(m.state ?? m.publishStatus ?? "").toUpperCase()) || m.isPublished;
            const { error } = await db.from("marketing_emails").insert({
              ...fields, blocks: [{ type: "text", text: "Imported from HubSpot. Open the email in HubSpot to see its full design." }],
              status: published ? "sent" : "draft", sent_at: published ? sentAt : null, scheduled_at: published ? null : null,
              author_id: userId, external_source: "hubspot", external_id: String(m.id),
            });
            if (!error) created++;
          }
          if (list.length < 100) break;
        }
        result["marketing_emails"] = { created, updated };
      } catch (e) {
        if (e instanceof Reconnect) throw e;
        result["marketing_emails"] = { error: e instanceof Error ? e.message : String(e) };
      }
    }
  } catch (e) {
    if (e instanceof Reconnect) return { connected: false as const, reconnectRequired: true };
    throw e;
  }
  await db.from("import_runs").insert({ provider: "hubspot", actor_id: userId, result });
  return { connected: true as const, result };
}

/** Email history for one contact (Sales/Marketing staff). */
export async function contactEmailHistory(userId: string, contactId: string) {
  const { db } = await requireMarketing(userId);
  const { data } = await db.from("crm_email_history").select("id, direction, subject, snippet, sent_at").eq("contact_id", contactId).order("sent_at", { ascending: false }).limit(200);
  return data ?? [];
}
