/**
 * Billing schedules: approved SOW lines → draft invoices on each due date.
 * Drafts, then issueScheduledDrafts sends only exact signed-SOW amounts; nothing here
 * charges or moves money.
 */
import { duePeriods, isFrequency, scheduleRef, type BillingFrequency } from "@/lib/invoice-schedule-model";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const today = () => new Date().toISOString().slice(0, 10);

/** Creates schedules for approved SOWs that don't have them yet. Lines keep their signed frequency. */
export async function syncSchedules() {
  const db = await admin();
  const sows: any[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from("client_sows").select("id, client_id, effective_date, approved_at, generated_lines, approval_status").eq("approval_status", "approved").order("id").range(from, from + 499);
    if (error) throw new Error(error.message);
    sows.push(...(data ?? []));
    if ((data ?? []).length < 500) break;
  }
  let created = 0;
  for (const sow of sows) {
    const lines = Array.isArray(sow.generated_lines) ? sow.generated_lines : [];
    if (!lines.length) continue;
    const { data: existing } = await db.from("invoice_schedules").select("line_index").eq("sow_id", sow.id);
    const have = new Set(((existing ?? []) as any[]).map((r) => r.line_index));
    const start = String(sow.effective_date ?? sow.approved_at ?? today()).slice(0, 10);
    const rows = lines.map((l: any, i: number) => ({ l, i })).filter(({ l, i }: any) => !have.has(i) && Number(l.amount_cents) > 0).map(({ l, i }: any) => ({
      sow_id: sow.id, client_id: sow.client_id, line_index: i, service_key: l.service_key ?? null, label: String(l.label ?? "Service"),
      amount_cents: Math.round(Number(l.amount_cents) || 0), frequency: isFrequency(l.billing_frequency) ? l.billing_frequency : "one_time",
      next_due_on: String(l.first_bill_on ?? start).slice(0, 10),
    }));
    if (!rows.length) continue;
    const { error } = await db.from("invoice_schedules").insert(rows);
    if (!error) created += rows.length;
  }
  return { created };
}

/** Drafts one invoice per SOW per due date for every schedule line that has come due. */
export async function draftDueInvoices(asOf = today()) {
  const db = await admin();
  const { data: due, error: dueErr } = await db.from("invoice_schedules").select("*").eq("active", true).lte("next_due_on", asOf).limit(1000);
  if (dueErr) throw new Error(dueErr.message);
  const groups = new Map<string, { sowId: string; clientId: string; start: string; end: string; lines: any[]; scheduleIds: Set<string> }>();
  const failed = new Set<string>();
  const advance: { id: string; next: string | null; frequency: BillingFrequency }[] = [];
  for (const s of (due ?? []) as any[]) {
    const periods = duePeriods(s.frequency, s.next_due_on, asOf);
    for (const p of periods) {
      const key = `${s.sow_id}:${p.start}`;
      const g = groups.get(key) ?? { sowId: s.sow_id, clientId: s.client_id, start: p.start, end: p.end, lines: [] as any[], scheduleIds: new Set<string>() };
      g.scheduleIds.add(s.id);
      if (p.end > g.end) g.end = p.end;
      g.lines.push({ source: "schedule", source_ref: scheduleRef(s.id, p.start), service_key: s.service_key, label: s.label, quantity: 1, unit_cents: s.amount_cents, amount_cents: s.amount_cents, sort_order: g.lines.length });
      groups.set(key, g);
    }
    const last = periods[periods.length - 1];
    if (last) advance.push({ id: s.id, next: last.next, frequency: s.frequency });
  }
  let drafted = 0;
  for (const g of groups.values()) {
    // Skip lines already billed for this period (the unique source_ref guarantees it).
    const refs = g.lines.map((l) => l.source_ref);
    const { data: billed, error: be } = await db.from("invoice_lines").select("source_ref").eq("source", "schedule").in("source_ref", refs);
    if (be) { g.scheduleIds.forEach((id) => failed.add(id)); continue; }
    const done = new Set(((billed ?? []) as any[]).map((b) => b.source_ref));
    const lines = g.lines.filter((l) => !done.has(l.source_ref));
    if (!lines.length) continue;
    const total = lines.reduce((n, l) => n + l.amount_cents, 0);
    const { data: inv, error } = await db.from("invoices").insert({
      client_id: g.clientId, sow_id: g.sowId, period_start: g.start, period_end: g.end, net_days: 30, status: "draft",
      total_cents: total, generated_by_schedule: true, note: "Prepared from the signed statement of work's billing schedule.",
    }).select("id").single();
    if (error) { g.scheduleIds.forEach((id) => failed.add(id)); continue; }
    const { error: le } = await db.from("invoice_lines").insert(lines.map((l) => ({ ...l, invoice_id: inv.id })));
    if (le) { await db.from("invoices").update({ status: "void", voided_at: new Date().toISOString(), void_reason: "Schedule lines were already billed." }).eq("id", inv.id); g.scheduleIds.forEach((id) => failed.add(id)); continue; }
    drafted++;
  }
  // A schedule moves to its next date only when every draft it was part of saved.
  for (const a of advance) if (!failed.has(a.id)) await db.from("invoice_schedules").update({ next_due_on: a.next, active: a.frequency !== "one_time" && !!a.next, updated_at: new Date().toISOString() }).eq("id", a.id);
  return { drafted };
}

/** The one place a paid invoice queues commission payouts, whatever marked it paid. */
export async function onInvoicePaid(invoiceId: string) {
  const { queueInvoicePayouts } = await import("@/lib/commissions.server");
  return queueInvoicePayouts(invoiceId);
}

/** Marks an issued invoice paid from a verified card payment, then queues payouts. */
export async function markInvoicePaidByCard(invoiceId: string, sessionId: string, paymentRef: string | null) {
  const db = await admin();
  const { data: inv } = await db.from("invoices").select("id, status, card_session_id, client_id, number").eq("id", invoiceId).maybeSingle();
  if (!inv) return;
  // A retry of an already-paid invoice still finishes queuing payouts (queuing is idempotent).
  if (inv.status === "paid") { await onInvoicePaid(invoiceId); return; }
  if (inv.status !== "issued" || inv.card_session_id !== sessionId) return;
  const paidOn = today();
  await db.from("invoices").update({ status: "paid", paid_on: paidOn, payment_reference: paymentRef ?? sessionId, client_payment_method: "card", client_paid_on: paidOn }).eq("id", invoiceId).eq("status", "issued");
  await db.from("billing_record_events").insert({ entity_kind: "invoice", entity_id: invoiceId, client_id: inv.client_id, event_kind: "card_payment_received", detail: { number: inv.number, session: sessionId } }).then(() => null, () => null);
  await onInvoicePaid(invoiceId);
}

/** A refunded or disputed card payment cancels any still-scheduled payouts. The invoice itself is handled by Finance. */
export async function onCardPaymentReversed(invoiceId: string, why: string) {
  const { cancelInvoicePayouts } = await import("@/lib/commissions.server");
  return cancelInvoicePayouts(invoiceId, why, null);
}

/**
 * Sends scheduled invoices automatically: only drafts the schedule made from a
 * Harmonious-approved, client-signed SOW, billed at exactly the signed amounts.
 * The SOW's own two-person approval stands in for issue review; anything else
 * stays a draft for staff. Emails the client and the assigned rep. Never charges.
 */
export async function issueScheduledDrafts(asOf = today()) {
  const db = await admin();
  const { data: drafts, error } = await db.from("invoices").select("id, client_id, sow_id, total_cents, period_start, period_end, note, net_days, sales_quote_id")
    .eq("status", "draft").eq("generated_by_schedule", true).is("voided_at", null).lte("period_start", asOf).limit(200);
  if (error) throw new Error(error.message);
  const { notifyClientAdminsWith, money, CLIENT_PORTAL_BASE } = await import("@/lib/client-notify.server");
  let issued = 0;
  for (const inv of (drafts ?? []) as any[]) {
    const { data: sow } = await db.from("client_sows").select("id, approval_status, client_signed_at, executed_at, generated_lines").eq("id", inv.sow_id).maybeSingle();
    if (!sow || sow.approval_status !== "approved" || (!sow.client_signed_at && !sow.executed_at)) continue;
    const { data: lines } = await db.from("invoice_lines").select("label, amount_cents, service_key, source").eq("invoice_id", inv.id).order("sort_order");
    const signed = Array.isArray(sow.generated_lines) ? sow.generated_lines : [];
    const matches = (lines ?? []).length > 0 && (lines ?? []).every((l: any) => l.source === "schedule" && signed.some((s: any) => (s.service_key ?? null) === (l.service_key ?? null) && Math.round(Number(s.amount_cents)) === Number(l.amount_cents)));
    if (!matches || Number(inv.total_cents) <= 0) continue;
    const year = asOf.slice(0, 4);
    const { count } = await db.from("invoices").select("id", { count: "exact", head: true }).not("number", "is", null).like("number", `HRM-${year}-%`);
    const number = `HRM-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;
    const net = Number(inv.net_days ?? 30);
    const d = new Date(`${asOf}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + net);
    const dueDate = d.toISOString().slice(0, 10);
    const { data: done, error: ue } = await db.from("invoices").update({ status: "issued", number, issue_date: asOf, due_date: dueDate, issued_at: new Date().toISOString(), approval_status: "pending", approval_requested_at: new Date().toISOString(), rate_variance_cents: 0, issue_self_reason: "Issued automatically from the signed statement of work's payment schedule." })
      .eq("id", inv.id).eq("status", "draft").select("id");
    if (ue || !done?.length) continue;
    issued++;
    await db.from("billing_record_events").insert({ entity_kind: "invoice", entity_id: inv.id, client_id: inv.client_id, event_kind: "scheduled_invoice_issued", detail: { number, sow_id: inv.sow_id } }).then(() => null, () => null);
    const { data: client } = await db.from("clients").select("legal_name, name").eq("id", inv.client_id).maybeSingle();
    await notifyClientAdminsWith(inv.client_id, "invoice-issued", `invoice-issued:${inv.id}`, (p) => ({
      contactName: p.name, clientName: client?.legal_name || client?.name || "your organization", invoiceNumber: number,
      amount: money(Number(inv.total_cents)), issueDate: asOf, dueDate, periodLabel: `${inv.period_start} to ${inv.period_end}`,
      lines: (lines ?? []).map((l: any) => ({ label: String(l.label ?? "Service fee"), amount: money(Number(l.amount_cents ?? 0)) })),
      payUrl: `${CLIENT_PORTAL_BASE}/client/invoices?invoice=${inv.id}`, note: inv.note || "",
    }));
    await notifyRepPaymentDue(db, inv, number, dueDate, client?.legal_name || client?.name || "Client").catch(() => console.error("[payment-schedule] rep notice failed"));
  }
  return { issued };
}

async function notifyRepPaymentDue(db: any, inv: any, number: string, dueDate: string, clientName: string) {
  let q = db.from("sales_quotes").select("owner_user_id, title").eq("status", "signed");
  q = inv.sales_quote_id ? q.eq("id", inv.sales_quote_id) : q.eq("sow_id", inv.sow_id);
  const { data: quote } = await q.limit(1).maybeSingle();
  if (!quote?.owner_user_id) return;
  const { data: auth } = await db.auth.admin.getUserById(quote.owner_user_id);
  if (!auth?.user?.email || !auth.user.email_confirmed_at) return;
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  await sendTemplateEmail("payment-due-rep", auth.user.email, {
    managed: true, inboxForAnyUser: true, idempotencyKey: `payment-due-rep:${inv.id}:${quote.owner_user_id}`,
    templateData: { clientName, invoiceNumber: number, amount: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(inv.total_cents) / 100), dueDate },
  } as any);
}
