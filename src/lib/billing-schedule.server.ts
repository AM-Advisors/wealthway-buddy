/**
 * Billing schedules: approved SOW lines → draft invoices on each due date.
 * Drafts only. Issuing needs a reviewer and a different issuer; nothing here
 * charges, issues or emails anyone.
 */
import { duePeriods, isFrequency, scheduleRef, type BillingFrequency } from "@/lib/invoice-schedule-model";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const today = () => new Date().toISOString().slice(0, 10);

/** Creates schedules for approved SOWs that don't have them yet. Lines keep their signed frequency. */
export async function syncSchedules() {
  const db = await admin();
  const { data: sows } = await db.from("client_sows").select("id, client_id, effective_date, approved_at, generated_lines, approval_status").eq("approval_status", "approved").limit(500);
  let created = 0;
  for (const sow of (sows ?? []) as any[]) {
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
  const { data: due } = await db.from("invoice_schedules").select("*").eq("active", true).lte("next_due_on", asOf).limit(1000);
  const groups = new Map<string, { sowId: string; clientId: string; start: string; end: string; lines: any[] }>();
  const advance: { id: string; next: string | null; frequency: BillingFrequency }[] = [];
  for (const s of (due ?? []) as any[]) {
    const periods = duePeriods(s.frequency, s.next_due_on, asOf);
    for (const p of periods) {
      const key = `${s.sow_id}:${p.start}`;
      const g = groups.get(key) ?? { sowId: s.sow_id, clientId: s.client_id, start: p.start, end: p.end, lines: [] };
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
    const { data: billed } = await db.from("invoice_lines").select("source_ref").eq("source", "schedule").in("source_ref", refs);
    const done = new Set(((billed ?? []) as any[]).map((b) => b.source_ref));
    const lines = g.lines.filter((l) => !done.has(l.source_ref));
    if (!lines.length) continue;
    const total = lines.reduce((n, l) => n + l.amount_cents, 0);
    const { data: inv, error } = await db.from("invoices").insert({
      client_id: g.clientId, sow_id: g.sowId, period_start: g.start, period_end: g.end, net_days: 30, status: "draft",
      total_cents: total, generated_by_schedule: true, note: "Prepared from the signed statement of work's billing schedule.",
    }).select("id").single();
    if (error) continue;
    const { error: le } = await db.from("invoice_lines").insert(lines.map((l) => ({ ...l, invoice_id: inv.id })));
    if (le) { await db.from("invoices").update({ status: "void", voided_at: new Date().toISOString(), void_reason: "Schedule lines were already billed." }).eq("id", inv.id); continue; }
    drafted++;
  }
  for (const a of advance) await db.from("invoice_schedules").update({ next_due_on: a.next, active: a.frequency !== "one_time" && !!a.next, updated_at: new Date().toISOString() }).eq("id", a.id);
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
  if (!inv || inv.status === "paid") return;
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
