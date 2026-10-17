/**
 * Current-client services, migration payment records, payment reminders and
 * individual sidebar grants. Every write is maker-checker and logged in the
 * append-only billing_record_events. Nothing here charges or moves money.
 */
import { canConfirm, dueBucket, entitlementsFromServices, nextDueDate, reminderStageFor, serviceCatalog, wantsReminder, type Cadence } from "@/lib/billing-model";
import { grantableItem } from "@/lib/ops-nav-registry";
import { requiredEntitlement } from "@/lib/saas-order-model";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
const nowIso = () => new Date().toISOString();
const today = () => nowIso().slice(0, 10);

const VIEW = ["super_admin", "admin", "operations", "account_manager", "client_success", "fund_administration", "finance", "executive", "leadership", "sales", "account_executive", "sales_management", "legal", "compliance"];
const PREPARE = ["super_admin", "admin", "operations", "account_manager", "client_success", "sales", "account_executive", "sales_management"];
const MONEY_CONFIRM = ["super_admin", "admin", "finance"];
const REMINDER_MANAGE = ["super_admin", "admin", "finance", "account_manager", "client_success", "operations"];

export async function rolesOf(uid: string): Promise<string[]> {
  const { data } = await (await db()).from("user_roles").select("role").eq("user_id", uid);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}
async function need(uid: string, allowed: string[], msg: string) {
  const r = await rolesOf(uid);
  if (!r.some((x) => allowed.includes(x))) throw new Error(msg);
  return r;
}
async function log(kind: string, id: string, clientId: string | null, actor: string | null, event: string, detail: Record<string, unknown> = {}) {
  await (await db()).from("billing_record_events").insert({ entity_kind: kind, entity_id: id, client_id: clientId, actor_id: actor, event_kind: event, detail });
}

const GATED_AREAS = [
  { path: "/client/cap-table", label: "Cap table" },
  { path: "/my-funds", label: "My funds" },
  { path: "/client/funds", label: "Fund pages" },
  { path: "/manager/", label: "Fund manager pages" },
];
function lostAreas(keys: string[]) {
  return GATED_AREAS.filter((a) => { const need = requiredEntitlement(a.path); return need && !keys.includes(need); }).map((a) => a.label);
}

/** Paid-through date per service key from confirmed migration payments. */
async function paidThrough(clientId: string) {
  const { data } = await (await db()).from("migration_payments").select("period_end, included_service_keys").eq("client_id", clientId).eq("status", "confirmed");
  const map = new Map<string, string>();
  for (const p of (data ?? []) as any[]) {
    if (!p.period_end) continue;
    for (const k of (p.included_service_keys ?? []) as string[]) if (!map.has(k) || map.get(k)! < p.period_end) map.set(k, p.period_end);
  }
  return map;
}

export async function clientServices(uid: string, clientId: string) {
  const roles = await need(uid, VIEW, "Staff only.");
  const d = await db();
  const [{ data: client }, { data: records }, { data: switches }, { data: payments }, { data: events }] = await Promise.all([
    d.from("clients").select("id, name, legal_name, menu_gating").eq("id", clientId).maybeSingle(),
    d.from("client_service_records").select("*").eq("client_id", clientId).order("created_at"),
    d.from("client_menu_switch_requests").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(5),
    d.from("migration_payments").select("*").eq("client_id", clientId).order("paid_on", { ascending: false }),
    d.from("billing_record_events").select("event_kind, actor_id, detail, created_at, entity_kind").eq("client_id", clientId).order("created_at", { ascending: false }).limit(50),
  ]);
  if (!client) throw new Error("Client not found.");
  const paid = await paidThrough(clientId);
  const rows = ((records ?? []) as any[]).map((r) => ({ ...r, next_due: r.status === "active" ? nextDueDate({ cadence: r.cadence, startDate: r.start_date, paidThrough: paid.get(r.service_key) ?? null }) : null }));
  const activeKeys = entitlementsFromServices(rows.filter((r) => r.status === "active").map((r) => r.service_key));
  return {
    client, records: rows, catalog: serviceCatalog(), switches: switches ?? [], payments: payments ?? [], events: events ?? [],
    preview: { keys: activeKeys, wouldLose: lostAreas(activeKeys) },
    me: uid, canPrepare: roles.some((x) => PREPARE.includes(x)), canConfirmMoney: roles.some((x) => MONEY_CONFIRM.includes(x)),
    canManageReminders: roles.some((x) => REMINDER_MANAGE.includes(x)), isSuperAdmin: roles.includes("super_admin"),
  };
}

export async function saveClientService(uid: string, input: { clientId: string; id?: string | undefined; serviceKey: string; cadence: Cadence; amountCents: number; startDate: string; cardAutopay: boolean; offeringId?: string | null | undefined }) {
  await need(uid, PREPARE, "Only Sales, Account Managers and Operations can set services.");
  const opt = serviceCatalog().find((o) => o.key === input.serviceKey);
  if (!opt) throw new Error("Unknown service.");
  const d = await db();
  const row = { service_key: opt.key, label: opt.label, cadence: input.cadence, amount_cents: input.amountCents, start_date: input.startDate, card_autopay: input.cardAutopay, offering_id: input.offeringId ?? null, status: "proposed", proposed_by: uid, approved_by: null, approved_at: null, updated_at: nowIso() };
  let id = input.id;
  if (id) {
    const { data: ex } = await d.from("client_service_records").select("client_id").eq("id", id).maybeSingle();
    if (!ex || ex.client_id !== input.clientId) throw new Error("Service not found.");
    await d.from("client_service_records").update(row).eq("id", id);
  } else {
    const { data, error } = await d.from("client_service_records").insert({ client_id: input.clientId, ...row }).select("id").single();
    if (error) throw new Error(error.message);
    id = data.id as string;
  }
  await log("service", id!, input.clientId, uid, input.id ? "service_changed" : "service_proposed", { service: opt.label, cadence: input.cadence, amount_cents: input.amountCents, start_date: input.startDate });
  return { id };
}

async function syncEntitlements(clientId: string) {
  const d = await db();
  const { data } = await d.from("client_service_records").select("service_key").eq("client_id", clientId).eq("status", "active");
  const keys = entitlementsFromServices(((data ?? []) as any[]).map((r) => r.service_key));
  const note = "Current-client services";
  await d.from("service_entitlements").update({ status: "not_included", termination_date: today() }).eq("client_id", clientId).is("offering_id", null).eq("note", note).not("service_key", "in", `(${keys.map((k) => `"${k}"`).join(",")})`);
  for (const key of keys) {
    const { data: ex } = await d.from("service_entitlements").select("id").eq("client_id", clientId).is("offering_id", null).eq("service_key", key).maybeSingle();
    const row = { status: "included", pricing_model: "recurring", effective_date: today(), termination_date: null, note };
    if (ex) await d.from("service_entitlements").update(row).eq("id", ex.id);
    else await d.from("service_entitlements").insert({ client_id: clientId, service_key: key, ...row });
  }
}

export async function decideClientService(uid: string, id: string, action: "approve" | "end" | "decline", note: string | null) {
  const roles = await need(uid, PREPARE, "Not allowed.");
  const d = await db();
  const { data: r } = await d.from("client_service_records").select("*").eq("id", id).maybeSingle();
  if (!r) throw new Error("Service not found.");
  if (action === "approve") {
    if (r.status !== "proposed") throw new Error("Only proposed services can be approved.");
    const ok = canConfirm(uid, r.proposed_by, roles, note);
    if (!ok.ok) throw new Error(ok.reason);
    await d.from("client_service_records").update({ status: "active", approved_by: uid, approved_at: nowIso(), approval_note: note, updated_at: nowIso() }).eq("id", id);
  } else if (action === "decline") {
    if (r.status !== "proposed") throw new Error("Only proposed services can be declined.");
    if (!note?.trim()) throw new Error("Please give a reason.");
    await d.from("client_service_records").delete().eq("id", id);
  } else {
    await d.from("client_service_records").update({ status: "ended", updated_at: nowIso() }).eq("id", id);
  }
  await log("service", id, r.client_id, uid, `service_${action === "approve" ? "approved" : action === "end" ? "ended" : "declined"}`, { service: r.label, note });
  await syncEntitlements(r.client_id);
  return { ok: true };
}

export async function requestMenuSwitch(uid: string, clientId: string) {
  await need(uid, PREPARE, "Not allowed.");
  const d = await db();
  const { data: open } = await d.from("client_menu_switch_requests").select("id").eq("client_id", clientId).eq("status", "pending").maybeSingle();
  if (open) throw new Error("A switch is already waiting for approval.");
  const { data: recs } = await d.from("client_service_records").select("service_key").eq("client_id", clientId).eq("status", "active");
  const keys = entitlementsFromServices(((recs ?? []) as any[]).map((r) => r.service_key));
  const { data, error } = await d.from("client_menu_switch_requests").insert({ client_id: clientId, requested_by: uid, preview: { keys, wouldLose: lostAreas(keys) } }).select("id").single();
  if (error) throw new Error(error.message);
  await log("menu_switch", data.id, clientId, uid, "menu_switch_requested", { wouldLose: lostAreas(keys) });
  return { id: data.id };
}

export async function decideMenuSwitch(uid: string, requestId: string, approve: boolean, note: string | null) {
  const roles = await need(uid, PREPARE, "Not allowed.");
  const d = await db();
  const { data: req } = await d.from("client_menu_switch_requests").select("*").eq("id", requestId).maybeSingle();
  if (!req || req.status !== "pending") throw new Error("Request not found.");
  if (approve) { const ok = canConfirm(uid, req.requested_by, roles, note); if (!ok.ok) throw new Error(ok.reason); }
  else if (!note?.trim()) throw new Error("Please give a reason.");
  await d.from("client_menu_switch_requests").update({ status: approve ? "approved" : "declined", decided_by: uid, decided_at: nowIso(), note }).eq("id", requestId);
  if (approve) { await syncEntitlements(req.client_id); await d.from("clients").update({ menu_gating: "entitlements" }).eq("id", req.client_id); }
  await log("menu_switch", requestId, req.client_id, uid, approve ? "menu_switch_approved" : "menu_switch_declined", { note });
  return { ok: true };
}

// ---------- Migration payments ----------
export async function fundMigrationPayments(uid: string, offeringId: string) {
  const roles = await need(uid, VIEW, "Staff only.");
  const d = await db();
  const [{ data: payments }, { data: fund }] = await Promise.all([
    d.from("migration_payments").select("*").eq("offering_id", offeringId).order("paid_on", { ascending: false }),
    d.from("offerings").select("id, name, client_id").eq("id", offeringId).maybeSingle(),
  ]);
  return { payments: payments ?? [], fund, catalog: serviceCatalog(), me: uid, canPrepare: roles.some((x) => PREPARE.includes(x)), canConfirm: roles.some((x) => MONEY_CONFIRM.includes(x)), isSuperAdmin: roles.includes("super_admin") };
}

export async function recordMigrationPayment(uid: string, input: { offeringId: string; amountCents: number; paidOn: string; method: string; periodStart: string | null; periodEnd: string | null; serviceKeys: string[]; note: string | null }) {
  await need(uid, PREPARE, "Only Sales, Account Managers and Operations can record payments.");
  await (await import("@/lib/fund-origin.server")).requireMigrationFund(input.offeringId);
  const valid = new Set(serviceCatalog().map((s) => s.key));
  if (input.serviceKeys.some((k) => !valid.has(k))) throw new Error("Unknown service.");
  if (input.periodStart && input.periodEnd && input.periodEnd < input.periodStart) throw new Error("Period end is before start.");
  const d = await db();
  const { data: fund } = await d.from("offerings").select("client_id").eq("id", input.offeringId).maybeSingle();
  if (!fund) throw new Error("Fund not found.");
  const { data, error } = await d.from("migration_payments").insert({
    offering_id: input.offeringId, client_id: fund.client_id ?? null, amount_cents: input.amountCents, paid_on: input.paidOn, method: input.method,
    period_start: input.periodStart, period_end: input.periodEnd, included_service_keys: input.serviceKeys, note: input.note, recorded_by: uid,
  }).select("id").single();
  if (error) throw new Error(error.message);
  await log("migration_payment", data.id, fund.client_id ?? null, uid, "payment_recorded", { offering_id: input.offeringId, amount_cents: input.amountCents, paid_on: input.paidOn, method: input.method });
  return { id: data.id };
}

export async function decideMigrationPayment(uid: string, id: string, confirm: boolean, note: string | null) {
  const roles = await need(uid, MONEY_CONFIRM, "Only Finance can confirm payment records.");
  const d = await db();
  const { data: p } = await d.from("migration_payments").select("*").eq("id", id).maybeSingle();
  if (!p || p.status !== "pending") throw new Error("Payment record not found.");
  if (confirm) { const ok = canConfirm(uid, p.recorded_by, roles, note); if (!ok.ok) throw new Error(ok.reason); }
  else if (!note?.trim()) throw new Error("Please give a reason.");
  await d.from("migration_payments").update({ status: confirm ? "confirmed" : "rejected", confirmed_by: uid, confirmed_at: nowIso(), confirm_note: note }).eq("id", id);
  await log("migration_payment", id, p.client_id, uid, confirm ? "payment_confirmed" : "payment_rejected", { note });
  return { ok: true };
}

// ---------- Payment reminders ----------
export async function paymentReminders(uid: string) {
  const roles = await need(uid, VIEW, "Staff only.");
  const d = await db();
  const { data: recs } = await d.from("client_service_records").select("id, client_id, label, cadence, amount_cents, start_date, status, card_autopay, reminders_paused, service_key").eq("status", "active");
  const clientIds = [...new Set(((recs ?? []) as any[]).map((r) => r.client_id))];
  const [{ data: clients }, { data: sends }] = await Promise.all([
    clientIds.length ? d.from("clients").select("id, name, legal_name").in("id", clientIds) : { data: [] },
    d.from("payment_reminder_sends").select("record_id, due_on, stage_key, sent_at, manual").order("sent_at", { ascending: false }).limit(500),
  ]);
  const names = new Map(((clients ?? []) as any[]).map((c) => [c.id, c.legal_name || c.name]));
  const paidCache = new Map<string, Map<string, string>>();
  const t = today();
  const rows = [];
  for (const r of (recs ?? []) as any[]) {
    if (!paidCache.has(r.client_id)) paidCache.set(r.client_id, await paidThrough(r.client_id));
    const due = nextDueDate({ cadence: r.cadence, startDate: r.start_date, paidThrough: paidCache.get(r.client_id)!.get(r.service_key) ?? null });
    if (!due) continue;
    const last = ((sends ?? []) as any[]).find((s) => s.record_id === r.id);
    rows.push({ ...r, client_name: names.get(r.client_id) ?? "Client", due_on: due, bucket: dueBucket(due, t), last_sent_at: last?.sent_at ?? null, emails: wantsReminder(r) });
  }
  rows.sort((a, b) => a.due_on.localeCompare(b.due_on));
  return { rows, canManage: roles.some((x) => REMINDER_MANAGE.includes(x)) };
}

async function sendOne(r: any, due: string, stage: { key: string; label: string }, actor: string | null, manual: boolean) {
  const d = await db();
  const { error } = await d.from("payment_reminder_sends").insert({ record_id: r.id, due_on: due, stage_key: manual ? `manual-${nowIso()}` : stage.key, manual, sent_by: actor });
  if (error) return false; // already sent at this stage
  const { money, notifyClientAdmins } = await import("@/lib/client-notify.server");
  await notifyClientAdmins(r.client_id, {
    headline: `Payment reminder: ${r.label}`,
    intro: `Your ${r.label} payment of ${money(Number(r.amount_cents))} is ${stage.label} (${due}). Pay by card from your portal or use the wire instructions on your invoice. Questions? Reply to operations@harmonious.co.`,
    details: [{ label: "Service", value: r.label }, { label: "Amount", value: money(Number(r.amount_cents)) }, { label: "Due", value: due }],
    actionLabel: "Open billing", actionPath: "/client/invoices",
    eventKey: `payment-reminder:${r.id}:${due}:${manual ? nowIso() : stage.key}`,
  });
  await log("service", r.id, r.client_id, actor, manual ? "reminder_sent_manually" : "reminder_sent", { due_on: due, stage: stage.key });
  return true;
}

export async function sendPaymentReminderNow(uid: string, recordId: string) {
  await need(uid, REMINDER_MANAGE, "Not allowed.");
  const d = await db();
  const { data: r } = await d.from("client_service_records").select("*").eq("id", recordId).maybeSingle();
  if (!r || r.status !== "active") throw new Error("Service not active.");
  const paid = await paidThrough(r.client_id);
  const due = nextDueDate({ cadence: r.cadence, startDate: r.start_date, paidThrough: paid.get(r.service_key) ?? null });
  if (!due) throw new Error("Nothing is due for this service.");
  const days = Math.round((Date.parse(due) - Date.parse(today())) / 86_400_000);
  await sendOne(r, due, { key: "manual", label: days < 0 ? `${-days} days past due` : days === 0 ? "due today" : `due in ${days} days` }, uid, true);
  return { ok: true };
}

export async function setRemindersPaused(uid: string, recordId: string, paused: boolean, reason: string | null) {
  await need(uid, REMINDER_MANAGE, "Not allowed.");
  if (paused && !reason?.trim()) throw new Error("Please give a reason for pausing.");
  const d = await db();
  const { data: r } = await d.from("client_service_records").select("client_id").eq("id", recordId).maybeSingle();
  if (!r) throw new Error("Service not found.");
  await d.from("client_service_records").update({ reminders_paused: paused, updated_at: nowIso() }).eq("id", recordId);
  await log("service", recordId, r.client_id, uid, paused ? "reminders_paused" : "reminders_resumed", { reason });
  return { ok: true };
}

/** Daily run (from the internal reminder job). */
export async function runPaymentReminders(t = today()) {
  const d = await db();
  const { data: recs } = await d.from("client_service_records").select("*").eq("status", "active");
  let sent = 0;
  const paidCache = new Map<string, Map<string, string>>();
  for (const r of (recs ?? []) as any[]) {
    if (!wantsReminder(r)) continue;
    if (!paidCache.has(r.client_id)) paidCache.set(r.client_id, await paidThrough(r.client_id));
    const due = nextDueDate({ cadence: r.cadence, startDate: r.start_date, paidThrough: paidCache.get(r.client_id)!.get(r.service_key) ?? null });
    if (!due) continue;
    const stage = reminderStageFor(due, t);
    if (stage && (await sendOne(r, due, stage, null, false))) sent++;
  }
  return { paymentReminders: sent };
}

// ---------- Individual sidebar grants ----------
export async function navGrantsFor(uid: string, userId: string) {
  const roles = await need(uid, VIEW, "Staff only.");
  const { data } = await (await db()).from("staff_nav_grants").select("id, item_url, item_title, reason, created_at, granted_by").eq("user_id", userId).is("revoked_at", null).order("created_at");
  return { grants: data ?? [], canGrant: roles.includes("super_admin") };
}

export async function grantNavItem(uid: string, userId: string, url: string, reason: string) {
  await need(uid, ["super_admin"], "Only Super Admins can give extra sidebar items.");
  const item = grantableItem(url);
  if (!item) throw new Error("That item can't be granted individually (money, tax and administration keep their own approvals).");
  if (reason.trim().length < 3) throw new Error("Please give a reason.");
  const d = await db();
  const { data: ex } = await d.from("staff_nav_grants").select("id").eq("user_id", userId).eq("item_url", url).is("revoked_at", null).maybeSingle();
  if (ex) return { id: ex.id };
  const { data, error } = await d.from("staff_nav_grants").insert({ user_id: userId, item_url: url, item_title: item.title, granted_by: uid, reason }).select("id").single();
  if (error) throw new Error(error.message);
  await d.from("access_audit_events").insert({ actor_id: uid, event_type: "sidebar_item_granted", target_user_id: userId, detail: { url, reason } }).then(() => null, () => null);
  await log("nav_grant", data.id, null, uid, "sidebar_item_granted", { user_id: userId, url, reason });
  return { id: data.id };
}

export async function revokeNavItem(uid: string, grantId: string) {
  await need(uid, ["super_admin"], "Only Super Admins can remove sidebar items.");
  const d = await db();
  const { data: g } = await d.from("staff_nav_grants").select("user_id, item_url").eq("id", grantId).maybeSingle();
  if (!g) throw new Error("Grant not found.");
  await d.from("staff_nav_grants").update({ revoked_at: nowIso(), revoked_by: uid }).eq("id", grantId);
  await log("nav_grant", grantId, null, uid, "sidebar_item_revoked", { user_id: g.user_id, url: g.item_url });
  return { ok: true };
}
