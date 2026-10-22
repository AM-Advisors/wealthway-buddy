import type { QuoteLineInput } from "./sales-model";

export type SharedQuoteLine = {
  service_key: string; label: string; quantity: number; unit_cents: number;
  baseline_unit_cents: number; line_cents: number; sort_order: number;
  billing_frequency: string; first_bill_on: string | null;
  bookkeeping_snapshot: unknown; service_details: QuoteLineInput["details"];
};

/** Shared commercial fields only; signatures, approvals and invoice history are never copied. */
export function sowLinesFromQuote(lines: SharedQuoteLine[]) {
  return lines.map(l => ({ service_key: l.service_key, label: l.label, quantity: l.quantity,
    unit_cents: l.unit_cents, amount_cents: l.line_cents, billing_frequency: l.billing_frequency,
    first_bill_on: l.first_bill_on, bookkeeping_snapshot: l.bookkeeping_snapshot,
    service_details: l.service_details ?? {} }));
}

export function quoteInputsFromRows(lines: SharedQuoteLine[]): QuoteLineInput[] {
  return lines.map(l => ({ serviceKey: l.service_key, label: l.label, quantity: Number(l.quantity),
    unitCents: Number(l.unit_cents), baselineUnitCents: Number(l.baseline_unit_cents),
    billingFrequency: l.billing_frequency as QuoteLineInput["billingFrequency"], firstBillOn: l.first_bill_on,
    bookkeeping: l.bookkeeping_snapshot as QuoteLineInput["bookkeeping"], details: l.service_details }));
}

export function linkedTermsEditProblem(quote: { status: string }, sow: {
  status: string; stage?: string | null; locked?: boolean; client_signed_at?: string | null;
  executed_at?: string | null; signed_on?: string | null;
}) {
  if (!["draft", "rejected"].includes(quote.status)) return "Create a new quote version before changing linked services or prices.";
  if (sow.locked || sow.client_signed_at || sow.executed_at || sow.signed_on || sow.status !== "draft" || (sow.stage && sow.stage !== "draft"))
    return "This SOW is already under review or signed. Use a new version or amendment.";
  return null;
}