/**
 * Email follow-up flows + engagement tracking. Server-only.
 * Flows never send on their own: each step becomes "due" and the contact's rep confirms the send.
 * Stop rules: reply, unsubscribe, deal won/lost, meeting set. Forwards are an estimate only.
 */
import { renderEmailHtml, renderEmailText, MARKETING_ACCESS } from "@/lib/marketing-model";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const SALES_ROLES = ["sales", "account_executive", "bdr", "sales_management", "cro", "account_manager"];
const FLOW_EDITORS = [...MARKETING_ACCESS, "cro", "sales_management"];
const STOP_STAGES = ["meeting_set", "contract_won", "contract_lost"];
const PROXY_UA = /GoogleImageProxy|YahooMailProxy|Outlook-iOS|ggpht/i;

async function rolesOf(db: any, userId: string) {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}
async function requireEditor(userId: string) {
  const db = await admin();
  const roles = await rolesOf(db, userId);
  if (!roles.some((r) => FLOW_EDITORS.includes(r))) throw new Error("Only Marketing and Sales leaders can build flows.");
  return db;
}
async function requireViewer(userId: string) {
  const db = await admin();
  const roles = await rolesOf(db, userId);
  if (!roles.some((r) => FLOW_EDITORS.includes(r) || SALES_ROLES.includes(r) || r === "leadership")) throw new Error("Only Marketing and Sales staff can view flows.");
  return db;
}
const addDays = (d: number, from = Date.now()) => new Date(from + d * 864e5).toISOString();

/* ---------------- Flows (build) ---------------- */
export async function listFlows(userId: string) {
  const db = await requireViewer(userId);
  const [{ data: flows }, { data: steps }, { data: enr }] = await Promise.all([
    db.from("email_flows").select("*").neq("status", "archived").order("created_at", { ascending: false }),
    db.from("email_flow_steps").select("flow_id"),
    db.from("email_flow_enrollments").select("flow_id, status"),
  ]);
  return ((flows ?? []) as any[]).map((f) => ({
    ...f,
    steps: ((steps ?? []) as any[]).filter((s) => s.flow_id === f.id).length,
    active: ((enr ?? []) as any[]).filter((e) => e.flow_id === f.id && e.status === "active").length,
    total: ((enr ?? []) as any[]).filter((e) => e.flow_id === f.id).length,
  }));
}

export async function getFlow(userId: string, id: string) {
  const db = await requireViewer(userId);
  const { data: flow } = await db.from("email_flows").select("*").eq("id", id).maybeSingle();
  if (!flow) throw new Error("Flow not found.");
  const [{ data: steps }, { data: enr }] = await Promise.all([
    db.from("email_flow_steps").select("*").eq("flow_id", id).order("position"),
    db.from("email_flow_enrollments").select("*").eq("flow_id", id).order("created_at", { ascending: false }).limit(300),
  ]);
  const cids = [...new Set(((enr ?? []) as any[]).map((e) => e.contact_id))];
  const { data: contacts } = cids.length ? await db.from("crm_contacts").select("id, full_name, email, organization").in("id", cids) : { data: [] };
  const cm = new Map(((contacts ?? []) as any[]).map((c) => [c.id, c]));
  const canEdit = (await rolesOf(db, userId)).some((r) => FLOW_EDITORS.includes(r));
  return { flow, steps: steps ?? [], canEdit, enrollments: ((enr ?? []) as any[]).map((e) => ({ ...e, contact: cm.get(e.contact_id) ?? null })) };
}

export async function saveFlow(userId: string, d: { id?: string | null | undefined; name: string; description?: string | null | undefined; audience: string; triggerKind: string; triggerStage?: string | null | undefined; steps: { delayDays: number; subject: string; body: string }[] }) {
  const db = await requireEditor(userId);
  if (!d.name.trim()) throw new Error("Give the flow a name.");
  if (d.triggerKind === "stage_change" && !d.triggerStage) throw new Error("Pick the sales stage that starts this flow.");
  if (d.triggerKind === "stage_change" && STOP_STAGES.includes(String(d.triggerStage))) throw new Error("That stage stops flows, so it can't start one.");
  if (d.steps.some((s) => !s.subject.trim() || !s.body.trim())) throw new Error("Every step needs a subject and a message.");
  const row = { name: d.name.trim(), description: d.description ?? null, audience: d.audience, trigger_kind: d.triggerKind, trigger_stage: d.triggerKind === "stage_change" ? d.triggerStage : null, updated_at: new Date().toISOString() };
  let id = d.id ?? null;
  if (id) {
    const { error } = await db.from("email_flows").update(row).eq("id", id);
    if (error) throw new Error("Couldn't save the flow.");
  } else {
    const { data, error } = await db.from("email_flows").insert({ ...row, created_by: userId }).select("id").single();
    if (error) throw new Error("Couldn't create the flow.");
    id = data.id as string;
  }
  // Steps: update in place by position (sent steps keep their id for history); extra old steps are kept only if already sent.
  const { data: existing } = await db.from("email_flow_steps").select("id, position").eq("flow_id", id);
  const byPos = new Map(((existing ?? []) as any[]).map((s) => [s.position, s.id]));
  for (const [i, s] of d.steps.entries()) {
    const pos = i + 1;
    const v = { delay_days: Math.max(0, Math.round(s.delayDays)), subject: s.subject.trim(), body: s.body, updated_at: new Date().toISOString() };
    if (byPos.has(pos)) await db.from("email_flow_steps").update(v).eq("id", byPos.get(pos));
    else await db.from("email_flow_steps").insert({ ...v, flow_id: id, position: pos });
  }
  for (const [pos, sid] of byPos) if (pos > d.steps.length) {
    const { count } = await db.from("email_flow_sends").select("id", { count: "exact", head: true }).eq("step_id", sid);
    if (!count) await db.from("email_flow_steps").delete().eq("id", sid);
  }
  return { id };
}

export async function setFlowStatus(userId: string, id: string, status: "active" | "paused" | "archived") {
  const db = await requireEditor(userId);
  if (status === "active") {
    const { count } = await db.from("email_flow_steps").select("id", { count: "exact", head: true }).eq("flow_id", id);
    if (!count) throw new Error("Add at least one step before turning the flow on.");
  }
  await db.from("email_flows").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (status === "archived") await stopWhere(db, (q: any) => q.eq("flow_id", id), "Flow archived");
  return { ok: true };
}

/* ---------------- Enrollment ---------------- */
async function stepCount(db: any, flowId: string) {
  const { data } = await db.from("email_flow_steps").select("position, delay_days").eq("flow_id", flowId).order("position");
  return (data ?? []) as any[];
}

async function enroll(db: any, flow: any, contact: any, via: string, actor: string | null, dealId: string | null) {
  if (!contact?.email || contact.consent === "unsubscribed") return false;
  const isClient = !!contact.client_id;
  if (flow.audience === "client" && !isClient) return false;
  if (flow.audience === "prospect" && isClient) return false;
  const steps = await stepCount(db, flow.id);
  if (!steps.length) return false;
  const { error } = await db.from("email_flow_enrollments").insert({
    flow_id: flow.id, contact_id: contact.id, deal_id: dealId, owner_user_id: contact.owner_user_id ?? actor, enrolled_by: actor,
    enrolled_via: via, next_step: 1, next_due_at: addDays(steps[0].delay_days),
  });
  return !error; // unique index ignores a second active enrollment
}

export async function enrollContact(userId: string, d: { flowId: string; contactId: string }) {
  const { salesActor } = await import("@/lib/sales-hub.server");
  const a = await salesActor(userId);
  const db = await admin();
  const { data: c } = await db.from("crm_contacts").select("*").eq("id", d.contactId).eq("scope", "harmonious").maybeSingle();
  if (!c || !(a.visible === null || a.visible.includes(c.owner_user_id))) throw new Error("Contact not found.");
  const { data: flow } = await db.from("email_flows").select("*").eq("id", d.flowId).maybeSingle();
  if (!flow || flow.status !== "active") throw new Error("That flow isn't turned on.");
  const { data: deal } = await db.from("crm_deals").select("id").eq("contact_id", c.id).is("archived_at", null).limit(1).maybeSingle();
  const ok = await enroll(db, flow, c, "manual", userId, deal?.id ?? null);
  if (!ok) throw new Error("This contact can't join that flow (already in it, unsubscribed, no email, or the wrong audience).");
  return { ok: true };
}

async function autoEnroll(db: any, kind: string, contactIds: string[], dealId: string | null, stage?: string) {
  if (!contactIds.length) return;
  let q = db.from("email_flows").select("*").eq("status", "active").eq("trigger_kind", kind);
  if (stage) q = q.eq("trigger_stage", stage);
  const { data: flows } = await q;
  if (!flows?.length) return;
  const { data: contacts } = await db.from("crm_contacts").select("*").in("id", contactIds);
  for (const f of flows as any[]) for (const c of (contacts ?? []) as any[]) await enroll(db, f, c, kind, null, dealId);
}

async function stopWhere(db: any, f: (q: any) => any, reason: string) {
  await f(db.from("email_flow_enrollments").update({ status: "stopped", stop_reason: reason, stopped_at: new Date().toISOString(), next_due_at: null }).eq("status", "active"));
}

/** Hooks called from Sales, Marketing and tracking code. Never throw into the caller. */
export async function onStageChange(dealId: string, stage: string) {
  try {
    const db = await admin();
    const { data: deal } = await db.from("crm_deals").select("id, contact_id").eq("id", dealId).maybeSingle();
    if (!deal?.contact_id) return;
    if (STOP_STAGES.includes(stage)) await stopWhere(db, (q: any) => q.eq("contact_id", deal.contact_id), stage === "meeting_set" ? "Meeting booked" : stage === "contract_won" ? "Deal won" : "Deal lost");
    else await autoEnroll(db, "stage_change", [deal.contact_id], deal.id, stage);
  } catch (e) { console.error("flow stage hook failed", e); }
}
export async function onReply(contactId: string) {
  try { await stopWhere(await admin(), (q: any) => q.eq("contact_id", contactId), "Replied"); } catch (e) { console.error("flow reply hook failed", e); }
}
export async function onUnsubscribe(email: string) {
  try {
    const db = await admin();
    const { data } = await db.from("crm_contacts").select("id").ilike("email", email);
    const ids = ((data ?? []) as any[]).map((c) => c.id);
    if (ids.length) await stopWhere(db, (q: any) => q.in("contact_id", ids), "Unsubscribed");
  } catch (e) { console.error("flow unsubscribe hook failed", e); }
}
export async function onClientSigned(clientId: string, dealId: string | null) {
  try {
    const db = await admin();
    let ids: string[] = [];
    if (dealId) { const { data } = await db.from("crm_deals").select("contact_id").eq("id", dealId).maybeSingle(); if (data?.contact_id) ids = [data.contact_id]; }
    if (!ids.length) { const { data } = await db.from("crm_contacts").select("id").eq("client_id", clientId).eq("scope", "harmonious").is("archived_at", null).limit(5); ids = ((data ?? []) as any[]).map((c) => c.id); }
    await autoEnroll(db, "client_signed", ids, dealId);
  } catch (e) { console.error("flow signed hook failed", e); }
}
/** A click with no reply since the email was sent starts "clicked but didn't reply" flows. */
export async function onEmailClick(recipient: string) {
  try {
    const db = await admin();
    const { data } = await db.from("crm_contacts").select("id").eq("scope", "harmonious").ilike("email", recipient).is("archived_at", null);
    const ids = ((data ?? []) as any[]).map((c) => c.id);
    if (!ids.length) return;
    const since = new Date(Date.now() - 14 * 864e5).toISOString();
    const { data: replies } = await db.from("sales_outreach").select("contact_id").in("contact_id", ids).eq("direction", "inbound").gte("occurred_at", since);
    const replied = new Set(((replies ?? []) as any[]).map((r) => r.contact_id));
    await autoEnroll(db, "email_click", ids.filter((i) => !replied.has(i)), null);
  } catch (e) { console.error("flow click hook failed", e); }
}

/* ---------------- Rep follow-ups (confirm each send) ---------------- */
export async function myFollowUps(userId: string) {
  const { salesActor } = await import("@/lib/sales-hub.server");
  const a = await salesActor(userId);
  const db = await admin();
  let q = db.from("email_flow_enrollments").select("*").eq("status", "active").order("next_due_at").limit(500);
  if (a.visible) q = q.in("owner_user_id", a.visible);
  const { data: enr } = await q;
  const E = (enr ?? []) as any[];
  const fids = [...new Set(E.map((e) => e.flow_id))], cids = [...new Set(E.map((e) => e.contact_id))];
  const [{ data: flows }, { data: steps }, { data: contacts }, { data: allFlows }] = await Promise.all([
    fids.length ? db.from("email_flows").select("id, name, status").in("id", fids) : { data: [] },
    fids.length ? db.from("email_flow_steps").select("*").in("flow_id", fids) : { data: [] },
    cids.length ? db.from("crm_contacts").select("id, full_name, email, organization, client_id").in("id", cids) : { data: [] },
    db.from("email_flows").select("id, name, audience").eq("status", "active").order("name"),
  ]);
  const fm = new Map(((flows ?? []) as any[]).map((f) => [f.id, f])), cm = new Map(((contacts ?? []) as any[]).map((c) => [c.id, c]));
  const S = (steps ?? []) as any[];
  const now = new Date().toISOString();
  return {
    flows: allFlows ?? [],
    items: E.map((e) => {
      const step = S.find((s) => s.flow_id === e.flow_id && s.position === e.next_step);
      const total = S.filter((s) => s.flow_id === e.flow_id).length;
      return { id: e.id, flow: fm.get(e.flow_id)?.name ?? "Flow", flowPaused: fm.get(e.flow_id)?.status !== "active", contact: cm.get(e.contact_id) ?? null,
        step: step ? { position: step.position, subject: step.subject, body: step.body } : null, total, dueAt: e.next_due_at, due: !!e.next_due_at && e.next_due_at <= now, via: e.enrolled_via };
    }),
  };
}

const fill = (s: string, c: any, rep: string) => s
  .replace(/\{\{\s*first_name\s*\}\}/gi, String(c.full_name ?? "").split(" ")[0] || "there")
  .replace(/\{\{\s*name\s*\}\}/gi, c.full_name ?? "there")
  .replace(/\{\{\s*company\s*\}\}/gi, c.organization ?? "your team")
  .replace(/\{\{\s*rep_name\s*\}\}/gi, rep);

export async function actOnFollowUp(userId: string, d: { enrollmentId: string; action: "send" | "skip" | "stop"; subject?: string | null | undefined; body?: string | null | undefined }) {
  const { salesActor, logOutreach } = await import("@/lib/sales-hub.server");
  const a = await salesActor(userId);
  const db = await admin();
  const { data: e } = await db.from("email_flow_enrollments").select("*").eq("id", d.enrollmentId).maybeSingle();
  if (!e || !(a.visible === null || a.visible.includes(e.owner_user_id))) throw new Error("Follow-up not found.");
  if (e.status !== "active") throw new Error("This contact is no longer in the flow.");
  if (d.action === "stop") { await stopWhere(db, (q: any) => q.eq("id", e.id), "Stopped by rep"); return { ok: true }; }
  const steps: any[] = ((await db.from("email_flow_steps").select("*").eq("flow_id", e.flow_id).order("position")).data ?? []) as any[];
  const step = steps.find((s) => s.position === e.next_step);
  if (!step) { await db.from("email_flow_enrollments").update({ status: "completed", next_due_at: null }).eq("id", e.id); return { ok: true }; }
  const { data: c } = await db.from("crm_contacts").select("*").eq("id", e.contact_id).maybeSingle();
  // Advance first (claim), so a double click can't send twice.
  const next = steps.find((s) => s.position === e.next_step + 1);
  const { data: claimed } = await db.from("email_flow_enrollments").update(next ? { next_step: next.position, next_due_at: addDays(next.delay_days) } : { status: "completed", next_due_at: null })
    .eq("id", e.id).eq("next_step", e.next_step).eq("status", "active").select("id");
  if (!claimed?.length) throw new Error("This step was already handled.");
  if (d.action === "skip") {
    await db.from("email_flow_sends").insert({ enrollment_id: e.id, step_id: step.id, position: step.position, recipient: c?.email ?? "", subject: step.subject, outcome: "skipped", sent_by: userId });
    return { ok: true };
  }
  const rollback = () => db.from("email_flow_enrollments").update({ status: "active", next_step: e.next_step, next_due_at: e.next_due_at }).eq("id", e.id);
  if (!c?.email || c.consent === "unsubscribed") { await stopWhere(db, (q: any) => q.eq("id", e.id), "Unsubscribed"); throw new Error("This contact has unsubscribed or has no email, so the flow was stopped."); }
  const { data: opt } = await db.from("sales_channel_optouts").select("id").eq("contact_id", c.id).eq("channel", "email").maybeSingle();
  if (opt) { await stopWhere(db, (q: any) => q.eq("id", e.id), "Unsubscribed"); throw new Error("This contact opted out of email, so the flow was stopped."); }
  const { data: me } = await db.from("profiles").select("legal_name, email").eq("user_id", userId).maybeSingle();
  const subject = fill(d.subject?.trim() || step.subject, c, me?.legal_name ?? "Harmonious");
  const body = fill(d.body?.trim() || step.body, c, me?.legal_name ?? "Harmonious");
  const { data: send, error } = await db.from("email_flow_sends").insert({ enrollment_id: e.id, step_id: step.id, position: step.position, recipient: c.email, subject, sent_by: userId }).select("id").single();
  if (error) { await rollback(); throw new Error("Couldn't record the send."); }
  try {
    const { unsubscribeUrlFor } = await import("@/lib/marketing.server");
    const { trackMarketingHtml } = await import("@/lib/email-tracking.server");
    const { sendMarketingEmail } = await import("@/lib/marketing-publish.server");
    const unsub = await unsubscribeUrlFor(c.email);
    const blocks = [{ type: "text" as const, text: body }];
    const html = await trackMarketingHtml(renderEmailHtml({ subject, blocks }, unsub), c.email, `flow:${send.id}`, unsub);
    await sendMarketingEmail(c.email, subject, html, renderEmailText({ blocks }, unsub), unsub, `flow:${send.id}`, me?.email ?? undefined);
  } catch (err) {
    await rollback();
    console.error("flow send failed", err);
    throw new Error("The email couldn't be sent. Please try again.");
  }
  await logOutreach(userId, { contactId: c.id, channel: "email", direction: "outbound", subject, body, visibility: "team", source: "sent", providerRef: `flow:${send.id}` }).catch(() => null);
  return { ok: true };
}

/* ---------------- Engagement ---------------- */
type Ev = { recipient: string; kind: string; ip_hash: string | null; user_agent: string | null; occurred_at: string; email_id: string | null; flow_send_id: string | null; url: string | null };
const fp = (e: Ev) => PROXY_UA.test(e.user_agent ?? "") ? "proxy" : `${e.ip_hash ?? "?"}|${(e.user_agent ?? "").slice(0, 60)}`;

/** Per message+recipient: more than one distinct non-proxy device/location ⇒ "likely forwarded" (estimate). */
function summarize(events: Ev[]) {
  const per = new Map<string, Ev[]>();
  for (const e of events) { const k = `${e.email_id ?? e.flow_send_id}|${e.recipient.toLowerCase()}`; per.set(k, [...(per.get(k) ?? []), e]); }
  let opens = 0, clicks = 0, uniqueOpens = 0, uniqueClicks = 0, forwards = 0;
  const forwardedKeys = new Set<string>();
  for (const [k, list] of per) {
    const o = list.filter((e) => e.kind === "open"), c = list.filter((e) => e.kind === "click");
    opens += o.length; clicks += c.length; if (o.length) uniqueOpens++; if (c.length) uniqueClicks++;
    const fps = new Set(list.map(fp).filter((f) => f !== "proxy"));
    if (fps.size > 1) { forwards++; forwardedKeys.add(k); }
  }
  return { opens, clicks, uniqueOpens, uniqueClicks, forwards, forwardedKeys };
}

export async function marketingEngagement(userId: string) {
  const db = await admin();
  const roles = await rolesOf(db, userId);
  if (!roles.some((r) => MARKETING_ACCESS.includes(r) || r === "leadership")) throw new Error("Only the Marketing team can view this.");
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [{ data: ev }, { data: sends }, { data: fsends }, { data: emails }, { count: unsubs }] = await Promise.all([
    db.from("marketing_email_events").select("recipient, kind, ip_hash, user_agent, occurred_at, email_id, flow_send_id, url").gte("occurred_at", since).limit(50000),
    db.from("marketing_email_sends").select("email_id, recipient, status").eq("status", "sent").gte("created_at", since).limit(50000),
    db.from("email_flow_sends").select("id, recipient, sent_at").eq("outcome", "sent").gte("sent_at", since).limit(20000),
    db.from("marketing_emails").select("id, name, sent_at").gte("sent_at", since).order("sent_at", { ascending: false }).limit(50),
    db.from("email_unsubscribes").select("email", { count: "exact", head: true }).gte("unsubscribed_at", since),
  ]);
  const E = (ev ?? []) as Ev[];
  const delivered = (sends ?? []).length + (fsends ?? []).length;
  const all = summarize(E);
  const recips = [...new Set([...((sends ?? []) as any[]).map((s) => s.recipient), ...((fsends ?? []) as any[]).map((s) => s.recipient)].map((r) => String(r).toLowerCase()))];
  const { data: cts } = recips.length ? await db.from("crm_contacts").select("id").in("email", recips.slice(0, 2000)) : { data: [] };
  const cIds = ((cts ?? []) as any[]).map((c) => c.id);
  const { count: replies } = cIds.length ? await db.from("sales_outreach").select("id", { count: "exact", head: true }).in("contact_id", cIds).eq("direction", "inbound").gte("occurred_at", since) : { count: 0 };
  const byDay: Record<string, { opens: number; clicks: number }> = {};
  for (const e of E) { const d = e.occurred_at.slice(0, 10); byDay[d] ??= { opens: 0, clicks: 0 }; byDay[d][e.kind === "open" ? "opens" : "clicks"]++; }
  const links: Record<string, number> = {};
  for (const e of E) if (e.kind === "click" && e.url) links[e.url] = (links[e.url] ?? 0) + 1;
  const perEmail = ((emails ?? []) as any[]).map((m) => {
    const s = summarize(E.filter((e) => e.email_id === m.id));
    const sent = ((sends ?? []) as any[]).filter((x) => x.email_id === m.id).length;
    return { id: m.id, name: m.name, sentAt: m.sent_at, sent, ...s, forwardedKeys: undefined };
  });
  const flowSum = summarize(E.filter((e) => e.flow_send_id));
  return {
    totals: { delivered, uniqueOpens: all.uniqueOpens, uniqueClicks: all.uniqueClicks, opens: all.opens, clicks: all.clicks, likelyForwards: all.forwards, replies: replies ?? 0, unsubscribes: unsubs ?? 0 },
    flows: { sent: (fsends ?? []).length, uniqueOpens: flowSum.uniqueOpens, uniqueClicks: flowSum.uniqueClicks },
    byDay: Object.entries(byDay).sort().map(([day, v]) => ({ day, ...v })),
    topLinks: Object.entries(links).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([url, n]) => ({ url, clicks: n })),
    perEmail,
  };
}

/** Sales view: engagement for the contacts this rep can see (their clients and prospects). */
export async function salesEngagement(userId: string) {
  const { salesActor } = await import("@/lib/sales-hub.server");
  const a = await salesActor(userId);
  const db = await admin();
  let q = db.from("crm_contacts").select("id, full_name, email, organization, client_id, owner_user_id, consent").eq("scope", "harmonious").is("archived_at", null).not("email", "is", null).limit(3000);
  if (a.visible) q = q.in("owner_user_id", a.visible);
  const { data: contacts } = await q;
  const C = (contacts ?? []) as any[];
  const emails = [...new Set(C.map((c) => String(c.email).toLowerCase()))];
  if (!emails.length) return { contacts: [], recent: [] };
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const [{ data: ev }, { data: inbound }, { data: names }] = await Promise.all([
    db.from("marketing_email_events").select("recipient, kind, ip_hash, user_agent, occurred_at, email_id, flow_send_id, url").in("recipient", emails).gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(20000),
    db.from("sales_outreach").select("contact_id, occurred_at").in("contact_id", C.map((c) => c.id)).eq("direction", "inbound").gte("occurred_at", since),
    db.from("marketing_emails").select("id, name"),
  ]);
  const E = (ev ?? []) as Ev[];
  const nm = new Map(((names ?? []) as any[]).map((m) => [m.id, m.name]));
  const fids = [...new Set(E.map((e) => e.flow_send_id).filter(Boolean))] as string[];
  const { data: fs } = fids.length ? await db.from("email_flow_sends").select("id, subject").in("id", fids) : { data: [] };
  const fsm = new Map(((fs ?? []) as any[]).map((x) => [x.id, x.subject]));
  const rows = C.map((c) => {
    const mine = E.filter((e) => e.recipient.toLowerCase() === String(c.email).toLowerCase());
    const s = summarize(mine);
    const replies = ((inbound ?? []) as any[]).filter((r) => r.contact_id === c.id).length;
    const score = s.uniqueOpens + s.clicks * 3 + replies * 5 + s.forwards * 2;
    return { id: c.id, name: c.full_name, email: c.email, organization: c.organization, kind: c.client_id ? "Client" : "Prospect", unsubscribed: c.consent === "unsubscribed",
      opens: s.opens, clicks: s.clicks, likelyForwarded: s.forwards, replies, lastActivity: mine[0]?.occurred_at ?? null, score };
  }).filter((r) => r.opens || r.clicks || r.replies).sort((x, y) => y.score - x.score);
  const cByEmail = new Map(C.map((c) => [String(c.email).toLowerCase(), c]));
  const recent = E.slice(0, 40).map((e) => ({ at: e.occurred_at, kind: e.kind, contact: cByEmail.get(e.recipient.toLowerCase())?.full_name ?? e.recipient,
    contactId: cByEmail.get(e.recipient.toLowerCase())?.id ?? null, what: e.email_id ? nm.get(e.email_id) ?? "Marketing email" : fsm.get(e.flow_send_id!) ?? "Follow-up email", url: e.kind === "click" ? e.url : null }));
  return { contacts: rows, recent };
}
