/** Server-only Sales outreach, dashboards and team management. Visibility re-derived every call. */
import {
  CONNECTED_OR_BEYOND, OPEN_STAGES, STAGE_WEIGHT, canManageTeam, canMoveToStage, legacyStage, normalizeStage, salesScope,
  type OutreachChannel, type SalesStage,
} from "@/lib/sales-model";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const SALES_TEAM_ROLES = ["sales", "account_executive", "bdr", "sales_management", "cro", "account_manager"];

export async function salesActor(userId: string) {
  const db = await admin();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  const scope = salesScope(roles);
  if (scope === "none") throw new Error("The Sales area is for Harmonious Sales staff.");
  let visible: string[] | null = null; // null = everyone
  if (scope === "own") visible = [userId];
  if (scope === "team") {
    // Everyone below this manager in the reporting chain (recursive); never the whole team by default.
    const { data: lines } = await db.from("sales_reporting_lines").select("user_id, manager_user_id");
    const all = (lines ?? []) as any[];
    const seen = new Set<string>([userId]);
    const queue = [userId];
    while (queue.length) {
      const m = queue.shift()!;
      for (const l of all) if (l.manager_user_id === m && !seen.has(l.user_id)) { seen.add(l.user_id); queue.push(l.user_id); }
    }
    visible = [...seen];
  }
  return { userId, roles, scope, visible };
}
type Actor = Awaited<ReturnType<typeof salesActor>>;
const canSee = (a: Actor, ownerId: string | null) => a.visible === null || (ownerId != null && a.visible.includes(ownerId));

export async function names(ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map<string, string>();
  const { data } = await (await admin()).from("profiles").select("user_id, legal_name, email").in("user_id", uniq);
  return new Map(((data ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email || "Team member"]));
}

export async function salesTeam(a: Actor) {
  const db = await admin();
  const { data } = await db.from("user_roles").select("user_id, role").in("role", SALES_TEAM_ROLES);
  const byUser = new Map<string, string[]>();
  for (const r of (data ?? []) as any[]) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.role]);
  const ids = [...byUser.keys()].filter((id) => canSee(a, id));
  const nm = await names(ids);
  const { data: lines } = await db.from("sales_reporting_lines").select("user_id, manager_user_id");
  const mgr = new Map(((lines ?? []) as any[]).map((l) => [l.user_id, l.manager_user_id]));
  return ids.map((id) => ({ id, name: nm.get(id) ?? "Team member", roles: byUser.get(id) ?? [], managerId: mgr.get(id) ?? null }))
    .sort((x, y) => x.name.localeCompare(y.name));
}

async function visibleOutreach(a: Actor, f: { from?: string | undefined; to?: string | undefined; ownerId?: string | undefined; channel?: string | undefined; serviceKey?: string | undefined; contactId?: string | undefined; limit?: number | undefined }) {
  const db = await admin();
  let q = db.from("sales_outreach").select("*").order("occurred_at", { ascending: false }).limit(f.limit ?? 5000);
  if (f.from) q = q.gte("occurred_at", f.from);
  if (f.to) q = q.lt("occurred_at", f.to);
  if (f.ownerId) q = q.eq("owner_user_id", f.ownerId);
  if (f.channel) q = q.eq("channel", f.channel);
  if (f.serviceKey) q = q.eq("service_key", f.serviceKey);
  if (f.contactId) q = q.eq("contact_id", f.contactId);
  if (a.visible) q = q.in("owner_user_id", a.visible);
  const { data } = await q;
  return ((data ?? []) as any[]).filter((r) => r.visibility !== "private" || r.owner_user_id === a.userId);
}

async function visibleDeals(a: Actor) {
  const db = await admin();
  let q = db.from("crm_deals").select("*").eq("scope", "harmonious").is("archived_at", null);
  if (a.visible) q = q.in("owner_user_id", a.visible);
  const { data } = await q;
  return ((data ?? []) as any[]).map((d) => ({ ...d, s: normalizeStage(d.sales_stage ?? d.stage) as SalesStage }));
}

async function visibleQuotes(a: Actor) {
  const db = await admin();
  let q = db.from("sales_quotes").select("*").neq("status", "superseded");
  if (a.visible) q = q.in("owner_user_id", a.visible);
  return ((await q).data ?? []) as any[];
}

const inRange = (iso: string | null | undefined, from: string, to: string) => !!iso && iso >= from && iso < to;

function revenue(deals: any[], quotes: any[], from: string, to: string, ownerId?: string) {
  const qs = quotes.filter((q) => !ownerId || q.owner_user_id === ownerId);
  const ds = deals.filter((d) => !ownerId || d.owner_user_id === ownerId);
  const quotedDeals = new Set(qs.map((q) => q.deal_id).filter(Boolean));
  const closed = qs.filter((q) => q.status === "signed" && inRange(q.signed_at, from, to)).reduce((s, q) => s + Number(q.total_cents), 0)
    + ds.filter((d) => d.s === "contract_won" && !quotedDeals.has(d.id) && inRange(d.stage_changed_at ?? d.updated_at, from, to)).reduce((s, d) => s + Number(d.amount_cents ?? 0), 0);
  const pending = qs.filter((q) => ["pending_approval", "approved", "sent"].includes(q.status)).reduce((s, q) => s + Number(q.total_cents), 0)
    + ds.filter((d) => ["quoted", "contract_sent"].includes(d.s) && !quotedDeals.has(d.id)).reduce((s, d) => s + Number(d.amount_cents ?? 0), 0);
  const forecast = ds.filter((d) => OPEN_STAGES.includes(d.s)).reduce((s, d) => s + Number(d.amount_cents ?? 0) * STAGE_WEIGHT[d.s as SalesStage], 0);
  const won = ds.filter((d) => d.s === "contract_won").length;
  const lost = ds.filter((d) => d.s === "contract_lost").length;
  return { closed, pending, forecast: Math.round(forecast), winRate: won + lost ? won / (won + lost) : null };
}

export async function dashboard(userId: string, from: string, to: string) {
  const a = await salesActor(userId);
  const db = await admin();
  const [rows, deals, quotes, team] = await Promise.all([visibleOutreach(a, { from, to }), visibleDeals(a), visibleQuotes(a), salesTeam(a)]);
  const count = (key: (r: any) => string | null) => {
    const m = new Map<string, number>();
    for (const r of rows) { const k = key(r) ?? "unassigned"; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].map(([k, n]) => ({ key: k, count: n })).sort((x, y) => y.count - x.count);
  };
  const touched = new Set(rows.map((r) => r.contact_id).filter(Boolean));
  const dealByContact = new Map(deals.map((d) => [d.contact_id, d]));
  const inbound = new Set(rows.filter((r) => r.direction === "inbound").map((r) => r.contact_id));
  const connected = [...touched].filter((c) => inbound.has(c) || CONNECTED_OR_BEYOND.includes(dealByContact.get(c)?.s)).length;
  const stageCounts: Record<string, number> = {};
  for (const d of deals) stageCounts[d.s] = (stageCounts[d.s] ?? 0) + 1;
  const viaCounts: Record<string, number> = {};
  for (const d of deals) if (d.connected_via && CONNECTED_OR_BEYOND.includes(d.s)) viaCounts[d.connected_via] = (viaCounts[d.connected_via] ?? 0) + 1;
  const nm = new Map(team.map((t) => [t.id, t.name]));
  const { data: catalog } = await db.from("pricing_items").select("service_key, label");
  const svc = new Map(((catalog ?? []) as any[]).map((c) => [c.service_key, c.label]));
  const stale = deals.filter((d) => OPEN_STAGES.includes(d.s)).map((d) => {
    const last = rows.filter((r) => r.contact_id === d.contact_id)[0]?.occurred_at ?? d.updated_at;
    return { id: d.id, title: d.title, owner: nm.get(d.owner_user_id) ?? "", stage: d.s, last, followUp: d.follow_up_at };
  }).filter((d) => (Date.now() - new Date(d.last).getTime()) > 14 * 864e5 || (d.followUp && d.followUp < new Date().toISOString().slice(0, 10)))
    .slice(0, 25);
  const perRep = team.map((t) => {
    const mine = rows.filter((r) => r.owner_user_id === t.id);
    return { id: t.id, name: t.name, roles: t.roles, outreach: mine.length, ...revenue(deals, quotes, from, to, t.id),
      meetings: deals.filter((d) => d.owner_user_id === t.id && ["meeting_set", "meeting_held"].includes(d.s)).length };
  });
  return {
    scope: a.scope, canManage: canManageTeam(a.roles), total: rows.length, contactsTouched: touched.size, connected,
    byOwner: count((r) => r.owner_user_id).map((x) => ({ ...x, label: nm.get(x.key) ?? "Team member" })),
    byChannel: count((r) => r.channel).map((x) => ({ ...x, label: x.key })),
    byService: count((r) => r.service_key).map((x) => ({ ...x, label: svc.get(x.key) ?? (x.key === "unassigned" ? "No service" : x.key) })),
    stageCounts, viaCounts, revenue: revenue(deals, quotes, from, to), perRep, stale,
    quoteStatus: ["draft", "pending_approval", "approved", "sent", "signed", "rejected", "lost"].map((st) => {
      const qs = quotes.filter((q: any) => q.status === st);
      return { status: st, count: qs.length, cents: qs.reduce((t: number, q: any) => t + Number(q.total_cents ?? 0), 0) };
    }),
    recentQuotes: [...quotes].sort((x: any, y: any) => String(y.updated_at ?? y.created_at).localeCompare(String(x.updated_at ?? x.created_at))).slice(0, 8)
      .map((q: any) => ({ id: q.id, title: q.title, number: q.quote_number, status: q.status, cents: Number(q.total_cents ?? 0), owner: nm.get(q.owner_user_id) ?? "" })),
  };
}

export async function listOutreach(userId: string, f: { from?: string | undefined; to?: string | undefined; ownerId?: string | undefined; channel?: string | undefined; serviceKey?: string | undefined; contactId?: string  | undefined}) {
  const a = await salesActor(userId);
  const rows = await visibleOutreach(a, { ...f, limit: 500 });
  const db = await admin();
  const cids = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))];
  const contacts = cids.length ? ((await db.from("crm_contacts").select("id, full_name, organization").in("id", cids)).data ?? []) as any[] : [];
  const cn = new Map(contacts.map((c) => [c.id, c]));
  const nm = await names(rows.map((r) => r.owner_user_id));
  return rows.map((r) => ({ id: r.id, channel: r.channel, direction: r.direction, subject: r.subject, body: r.body, occurredAt: r.occurred_at,
    serviceKey: r.service_key, source: r.source, visibility: r.visibility, deliveryStatus: r.delivery_status, stageAfter: r.stage_after,
    contactId: r.contact_id, contactName: cn.get(r.contact_id)?.full_name ?? "No contact", organization: cn.get(r.contact_id)?.organization ?? null,
    ownerId: r.owner_user_id, ownerName: nm.get(r.owner_user_id) ?? "Team member" }));
}

export async function contactsForOutreach(userId: string) {
  const a = await salesActor(userId);
  const db = await admin();
  let q = db.from("crm_contacts").select("id, full_name, email, phone, organization, title, linkedin_url, consent, owner_user_id").eq("scope", "harmonious").is("archived_at", null).order("full_name");
  if (a.visible) q = q.in("owner_user_id", a.visible);
  const contacts = ((await q).data ?? []) as any[];
  const deals = await visibleDeals(a);
  const { data: opt } = await db.from("sales_channel_optouts").select("contact_id, channel");
  const optouts = ((opt ?? []) as any[]);
  return contacts.map((c) => {
    const d = deals.find((x) => x.contact_id === c.id);
    return { ...c, dealId: d?.id ?? null, stage: d?.s ?? null, serviceKey: d?.service_key ?? null, followUp: d?.follow_up_at ?? null,
      optedOut: optouts.filter((o) => o.contact_id === c.id).map((o) => o.channel) };
  });
}

async function loadContact(a: Actor, contactId: string) {
  const db = await admin();
  const { data: c } = await db.from("crm_contacts").select("*").eq("id", contactId).eq("scope", "harmonious").maybeSingle();
  if (!c || !canSee(a, c.owner_user_id)) throw new Error("Contact not found.");
  return c;
}

export async function logOutreach(userId: string, d: { contactId: string; channel: OutreachChannel; direction: "outbound" | "inbound"; subject?: string | null | undefined; body?: string | null | undefined; occurredAt?: string | null | undefined; serviceKey?: string | null | undefined; visibility: "team" | "private"; source?: "logged" | "sent" | "pulled_in" | undefined; deliveryStatus?: string | null | undefined; providerRef?: string | null  | undefined}) {
  const a = await salesActor(userId);
  const c = await loadContact(a, d.contactId);
  const db = await admin();
  const deal = (await visibleDeals(a)).find((x) => x.contact_id === c.id);
  const { error } = await db.from("sales_outreach").insert({
    contact_id: c.id, deal_id: deal?.id ?? null, owner_user_id: c.owner_user_id ?? userId, channel: d.channel, direction: d.direction,
    subject: d.subject ?? null, body: d.body ?? null, occurred_at: d.occurredAt || new Date().toISOString(), service_key: d.serviceKey ?? deal?.service_key ?? null,
    visibility: d.visibility, source: d.source ?? "logged", delivery_status: d.deliveryStatus ?? null, provider_ref: d.providerRef ?? null, created_by: userId,
  });
  if (error) throw new Error("Couldn't save that outreach.");
  if (d.direction === "inbound" && /^\s*(stop|unsubscribe|stopall|cancel)\s*$/i.test(d.body ?? "") && (d.channel === "text" || d.channel === "whatsapp")) {
    await db.from("sales_channel_optouts").upsert({ contact_id: c.id, channel: d.channel, recorded_by: userId, note: "Replied STOP" }, { onConflict: "contact_id,channel", ignoreDuplicates: true });
  }
  if (!deal) {
    await db.from("crm_deals").insert({ scope: "harmonious", owner_user_id: c.owner_user_id ?? userId, contact_id: c.id, title: c.organization || c.full_name,
      stage: "lead", sales_stage: "outreach", stage_changed_at: new Date().toISOString(), service_key: d.serviceKey ?? null, created_by: userId });
  }
  return { ok: true };
}

export async function sendOutreach(userId: string, d: { contactId: string; channel: "email" | "text" | "whatsapp"; subject?: string | null | undefined; body: string; serviceKey?: string | null | undefined; visibility: "team" | "private" }) {
  const a = await salesActor(userId);
  const c = await loadContact(a, d.contactId);
  const db = await admin();
  const { data: opt } = await db.from("sales_channel_optouts").select("id").eq("contact_id", c.id).eq("channel", d.channel).maybeSingle();
  if (opt) throw new Error("This contact has opted out of this channel.");
  let providerRef: string | null = null;
  if (d.channel === "email") {
    if (!c.email) throw new Error("This contact has no email address.");
    if (c.consent === "unsubscribed") throw new Error("This contact has unsubscribed from email.");
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    let res;
    try {
      res = await sendTemplateEmail("crm-campaign", c.email, { templateData: { subject: d.subject || "Following up", body: d.body, fundName: null } });
    } catch (e) { console.error("Sales email failed", e); throw new Error("The email couldn't be sent. Please try again."); }
    if (!res.sent) throw new Error("This address is on the do-not-email list.");
  } else {
    if (!c.phone) throw new Error("This contact has no phone number.");
    const lovable = process.env["LOVABLE_API_KEY"];
    const twilio = process.env["TWILIO_API_KEY"];
    const from = d.channel === "whatsapp" ? process.env["TWILIO_WHATSAPP_FROM"] : process.env["TWILIO_FROM_NUMBER"];
    if (!lovable || !twilio || !from) throw new Error("Texting and WhatsApp aren't connected yet. Log the message instead.");
    const to = d.channel === "whatsapp" ? `whatsapp:${c.phone}` : c.phone;
    const sender = d.channel === "whatsapp" && !from.startsWith("whatsapp:") ? `whatsapp:${from}` : from;
    const res = await fetch("https://connector-gateway.lovable.dev/twilio/Messages.json", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": twilio, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: sender, Body: d.body }),
    });
    const body = await res.text();
    if (!res.ok) { console.error(`Twilio send failed [${res.status}]: ${body}`); throw new Error("The message couldn't be sent. Check the number and try again."); }
    try { providerRef = JSON.parse(body).sid ?? null; } catch { providerRef = null; }
  }
  await logOutreach(userId, { contactId: c.id, channel: d.channel, direction: "outbound", subject: d.subject ?? null, body: d.body, serviceKey: d.serviceKey ?? null, visibility: d.visibility, source: "sent", deliveryStatus: "sent", providerRef });
  return { ok: true };
}

export async function recordOptOut(userId: string, d: { contactId: string; channel: "email" | "text" | "whatsapp"; note?: string | null  | undefined}) {
  const a = await salesActor(userId);
  const c = await loadContact(a, d.contactId);
  const db = await admin();
  await db.from("sales_channel_optouts").upsert({ contact_id: c.id, channel: d.channel, recorded_by: userId, note: d.note ?? null }, { onConflict: "contact_id,channel", ignoreDuplicates: true });
  if (d.channel === "email") await db.from("crm_contacts").update({ consent: "unsubscribed", consent_recorded_at: new Date().toISOString() }).eq("id", c.id);
  return { ok: true };
}

export async function parseLinkedIn(userId: string, d: { text: string }) {
  await salesActor(userId);
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("The LinkedIn reader isn't available right now.");
  const schema = { type: "object", additionalProperties: false, properties: {
    contact: { type: "object", additionalProperties: false, properties: { full_name: { type: ["string", "null"] }, title: { type: ["string", "null"] }, organization: { type: ["string", "null"] }, linkedin_url: { type: ["string", "null"] } }, required: ["full_name", "title", "organization", "linkedin_url"] },
    messages: { type: "array", items: { type: "object", additionalProperties: false, properties: { date: { type: ["string", "null"] }, direction: { type: "string", enum: ["outbound", "inbound"] }, sender: { type: ["string", "null"] }, text: { type: "string" } }, required: ["date", "direction", "sender", "text"] } },
  }, required: ["contact", "messages"] };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      instructions: "A salesperson pasted text they copied from LinkedIn (a conversation and/or a profile). Split it into individual messages exactly as written, with dates as YYYY-MM-DD when shown (otherwise null) and direction 'outbound' when sent by the salesperson ('You', 'Me' or the first-person side) else 'inbound'. Extract only contact details that appear in the text; use null otherwise. Never invent anything.",
      input: d.text.slice(0, 40_000),
      tools: [{ type: "function", name: "report", description: "Report parsed LinkedIn content.", strict: true, parameters: schema }],
      tool_choice: { type: "function", name: "report" },
    }),
  });
  if (res.status === 429) throw new Error("Too many requests right now. Please try again in a minute.");
  if (res.status === 402) throw new Error("AI credits have run out for this workspace.");
  if (!res.ok) { console.error("LinkedIn parse failed", res.status, await res.text()); throw new Error("Couldn't read that text. Try pasting a smaller section."); }
  const json: any = await res.json();
  const args = (json.output ?? []).find((o: any) => o.type === "function_call")?.arguments;
  const parsed = args ? JSON.parse(args) : { messages: [] };
  return { contact: parsed.contact ?? {}, messages: (parsed.messages ?? []) as { date: string | null; direction: "outbound" | "inbound"; sender: string | null; text: string }[] };
}

export async function saveLinkedInImport(userId: string, d: { contactId: string; messages: { date: string | null; direction: "outbound" | "inbound"; text: string; visibility: "team" | "private" }[]; contactFields: { title?: string | null | undefined; organization?: string | null | undefined; linkedin_url?: string | null  | undefined}; serviceKey?: string | null  | undefined}) {
  const a = await salesActor(userId);
  const c = await loadContact(a, d.contactId);
  const db = await admin();
  const fields = Object.fromEntries(Object.entries(d.contactFields).filter(([, v]) => v));
  if (Object.keys(fields).length) await db.from("crm_contacts").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", c.id);
  for (const m of d.messages) {
    await logOutreach(userId, { contactId: c.id, channel: "linkedin", direction: m.direction, body: m.text, occurredAt: m.date ? `${m.date}T12:00:00Z` : null, serviceKey: d.serviceKey ?? null, visibility: m.visibility, source: "pulled_in" });
  }
  return { ok: true, saved: d.messages.length };
}

export async function moveStage(userId: string, d: { dealId: string; stage: SalesStage; connectedVia?: string | null | undefined; followUpAt?: string | null | undefined; lossReason?: string | null | undefined; note?: string | null | undefined; serviceKey?: string | null | undefined; amountCents?: number | null  | undefined}) {
  const a = await salesActor(userId);
  if (!canMoveToStage(a.roles, d.stage)) throw new Error("Your role can't move a deal to that stage. Hand it to an Account Executive.");
  if (d.stage === "contract_lost" && !d.lossReason?.trim()) throw new Error("Add the reason this contract was lost.");
  if (d.stage === "contact_later" && !d.followUpAt) throw new Error("Pick a follow-up date.");
  if (d.stage === "connected" && !d.connectedVia) throw new Error("Choose how you connected.");
  const db = await admin();
  const { data: deal } = await db.from("crm_deals").select("*").eq("id", d.dealId).maybeSingle();
  if (!deal || !canSee(a, deal.owner_user_id)) throw new Error("Deal not found.");
  const from = normalizeStage(deal.sales_stage ?? deal.stage);
  const now = new Date().toISOString();
  const patch: any = { sales_stage: d.stage, stage: legacyStage(d.stage), stage_changed_at: now, updated_at: now };
  if (d.connectedVia) patch.connected_via = d.connectedVia;
  if (d.followUpAt !== undefined) patch.follow_up_at = d.followUpAt;
  if (d.lossReason) patch.lost_reason = d.lossReason;
  if (d.serviceKey) patch.service_key = d.serviceKey;
  if (d.amountCents != null) patch.amount_cents = d.amountCents;
  const { error } = await db.from("crm_deals").update(patch).eq("id", deal.id);
  if (error) throw new Error("Couldn't update the stage.");
  await db.from("sales_stage_events").insert({ deal_id: deal.id, from_stage: from, to_stage: d.stage, connected_via: d.connectedVia ?? null, follow_up_at: d.followUpAt ?? null, loss_reason: d.lossReason ?? null, note: d.note ?? null, actor_id: userId });
  return { ok: true };
}

export async function repOverview(userId: string, repId: string, from: string, to: string): Promise<any> {
  const a = await salesActor(userId);
  if (!canSee(a, repId)) throw new Error("You can only see your own overview.");
  const db = await admin();
  const [rows, allDeals, quotes, nm] = await Promise.all([visibleOutreach(a, { from, to, ownerId: repId }), visibleDeals(a), visibleQuotes(a), names([repId])]);
  const deals = allDeals.filter((d) => d.owner_user_id === repId);
  const stageCounts: Record<string, number> = {};
  for (const d of deals) stageCounts[d.s] = (stageCounts[d.s] ?? 0) + 1;
  const dealIds = deals.map((d) => d.id);
  const events = dealIds.length ? ((await db.from("sales_stage_events").select("deal_id, from_stage, to_stage, created_at").in("deal_id", dealIds).order("created_at")).data ?? []) as any[] : [];
  const meetingsHeld = events.filter((e) => e.to_stage === "meeting_held" && inRange(e.created_at, from, to)).length;
  const touched = new Set(rows.map((r) => r.contact_id).filter(Boolean));
  const connected = [...touched].filter((c) => rows.some((r) => r.contact_id === c && r.direction === "inbound") || CONNECTED_OR_BEYOND.includes(deals.find((d) => d.contact_id === c)?.s as SalesStage)).length;
  // average days in stage from consecutive events
  const dwell = new Map<string, number[]>();
  const byDeal = new Map<string, any[]>();
  for (const e of events) byDeal.set(e.deal_id, [...(byDeal.get(e.deal_id) ?? []), e]);
  for (const evs of byDeal.values()) for (let i = 1; i < evs.length; i++) {
    const days = (new Date(evs[i].created_at).getTime() - new Date(evs[i - 1].created_at).getTime()) / 864e5;
    dwell.set(evs[i - 1].to_stage, [...(dwell.get(evs[i - 1].to_stage) ?? []), days]);
  }
  const avgDays = Object.fromEntries([...dwell.entries()].map(([k, v]) => [k, Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10]));
  // Clients for this rep and their assigned Operations / Account Manager
  const contactIds = deals.map((d) => d.contact_id).filter(Boolean);
  const contacts = contactIds.length ? ((await db.from("crm_contacts").select("id, client_id").in("id", contactIds)).data ?? []) as any[] : [];
  const { data: owned } = await db.from("client_team_assignments").select("client_id").eq("user_id", repId);
  const clientIds = [...new Set([...deals.map((d) => d.client_id), ...contacts.map((c) => c.client_id), ...((owned ?? []) as any[]).map((o) => o.client_id)].filter(Boolean))];
  const clients = clientIds.length ? ((await db.from("clients").select("id, legal_name").in("id", clientIds)).data ?? []) as any[] : [];
  const assigns = clientIds.length ? ((await db.from("client_team_assignments").select("client_id, team_role, user_id").in("client_id", clientIds)).data ?? []) as any[] : [];
  const an = await names(assigns.map((x) => x.user_id));
  const { data: tgt } = await db.from("sales_targets").select("*").eq("user_id", repId).lte("period_start", to.slice(0, 10)).gte("period_end", from.slice(0, 10)).order("period_start", { ascending: false }).limit(1);
  const today = new Date().toISOString().slice(0, 10);
  const lastInbound = new Map<string, any>();
  for (const r of rows) if (r.direction === "inbound" && !lastInbound.has(r.contact_id)) lastInbound.set(r.contact_id, r);
  const repliesWaiting = [...lastInbound.values()].filter((r) => !rows.some((o) => o.contact_id === r.contact_id && o.direction === "outbound" && o.occurred_at > r.occurred_at)).length;
  return {
    id: repId, name: nm.get(repId) ?? "Team member", outreach: rows.length, contactsTouched: touched.size, connected, meetingsHeld,
    stageCounts, avgDays, ...revenue(deals, quotes, from, to),
    byChannel: Object.entries(rows.reduce((m: Record<string, number>, r) => ({ ...m, [r.channel]: (m[r.channel] ?? 0) + 1 }), {})).map(([k, v]) => ({ key: k, count: v })),
    target: tgt?.[0] ? { revenueCents: Number(tgt[0].revenue_target_cents), outreach: tgt[0].outreach_target, start: tgt[0].period_start, end: tgt[0].period_end } : null,
    today: {
      followUps: deals.filter((d) => d.follow_up_at && d.follow_up_at <= today && OPEN_STAGES.includes(d.s)).map((d) => ({ id: d.id, title: d.title, date: d.follow_up_at })),
      repliesWaiting,
      quotesAwaitingSignature: quotes.filter((q) => q.owner_user_id === repId && q.status === "sent").map((q) => ({ id: q.id, title: q.title })),
    },
    clients: clients.map((c) => ({ id: c.id, name: c.legal_name,
      operations: assigns.filter((x) => x.client_id === c.id && x.team_role === "operations").map((x) => an.get(x.user_id) ?? "Team member"),
      accountManagers: assigns.filter((x) => x.client_id === c.id && x.team_role === "account_manager").map((x) => an.get(x.user_id) ?? "Team member") })),
    deals: deals.map((d) => ({ id: d.id, title: d.title, stage: d.s, amountCents: d.amount_cents, followUp: d.follow_up_at, lostReason: d.lost_reason })),
  };
}

export async function setTarget(userId: string, d: { repId: string; periodStart: string; periodEnd: string; revenueTargetCents: number; outreachTarget: number }) {
  const a = await salesActor(userId);
  if (!canManageTeam(a.roles) || !canSee(a, d.repId) || d.repId === userId && a.scope !== "all") throw new Error("Only Sales leadership can set targets.");
  const db = await admin();
  const { error } = await db.from("sales_targets").upsert({ user_id: d.repId, period_start: d.periodStart, period_end: d.periodEnd, revenue_target_cents: d.revenueTargetCents, outreach_target: d.outreachTarget, set_by: userId, updated_at: new Date().toISOString() }, { onConflict: "user_id,period_start,period_end" });
  if (error) throw new Error("Couldn't save the target.");
  return { ok: true };
}

export async function setReportingLine(userId: string, d: { repId: string; managerId: string | null }) {
  const a = await salesActor(userId);
  if (a.scope !== "all") throw new Error("Only the CRO or CEO can change who reports to whom.");
  const db = await admin();
  await db.from("sales_reporting_lines").upsert({ user_id: d.repId, manager_user_id: d.managerId, updated_by: userId, updated_at: new Date().toISOString() });
  return { ok: true };
}

export async function reassignDeal(userId: string, d: { dealId: string; ownerId: string }) {
  const a = await salesActor(userId);
  if (!canManageTeam(a.roles) || !canSee(a, d.ownerId)) throw new Error("Only Sales leadership can reassign leads.");
  const db = await admin();
  const { data: deal } = await db.from("crm_deals").select("id, owner_user_id, contact_id").eq("id", d.dealId).maybeSingle();
  if (!deal || !canSee(a, deal.owner_user_id)) throw new Error("Deal not found.");
  await db.from("crm_deals").update({ owner_user_id: d.ownerId, updated_at: new Date().toISOString() }).eq("id", deal.id);
  if (deal.contact_id) await db.from("crm_contacts").update({ owner_user_id: d.ownerId }).eq("id", deal.contact_id);
  return { ok: true };
}

/** Round-robin: give unowned or leadership-held open leads to the rep with the fewest open deals. */
export async function roundRobin(userId: string, d: { dealIds: string[] }) {
  const a = await salesActor(userId);
  if (!canManageTeam(a.roles)) throw new Error("Only Sales leadership can assign leads.");
  const team = (await salesTeam(a)).filter((t) => t.roles.some((r) => ["account_executive", "bdr", "sales"].includes(r)));
  if (!team.length) throw new Error("No reps to assign to yet.");
  const deals = await visibleDeals(a);
  const load = new Map(team.map((t) => [t.id, deals.filter((x) => x.owner_user_id === t.id && OPEN_STAGES.includes(x.s)).length]));
  for (const id of d.dealIds) {
    const next = [...load.entries()].sort((x, y) => x[1] - y[1])[0]![0];
    await reassignDeal(userId, { dealId: id, ownerId: next });
    load.set(next, (load.get(next) ?? 0) + 1);
  }
  return { ok: true };
}

export async function lossReasons(userId: string, from: string, to: string) {
  const a = await salesActor(userId);
  const deals = await visibleDeals(a);
  const ids = deals.map((d) => d.id);
  if (!ids.length) return [];
  const db = await admin();
  const { data } = await db.from("sales_stage_events").select("loss_reason, created_at").in("deal_id", ids).eq("to_stage", "contract_lost").gte("created_at", from).lt("created_at", to);
  const m = new Map<string, number>();
  for (const e of (data ?? []) as any[]) { const k = String(e.loss_reason ?? "Unspecified").trim(); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([reason, count]) => ({ reason, count })).sort((x, y) => y.count - x.count);
}
