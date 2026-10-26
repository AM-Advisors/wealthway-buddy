/** Recorded receipt totals are append-only snapshots, never inferred from notes. */
export function invoiceBalance(invoice: { total_cents?: unknown; status?: string; recorded_paid_cents?: unknown }) {
  const total = Math.max(0, Math.round(Number(invoice.total_cents) || 0));
  const recorded = Math.max(0, Math.round(Number(invoice.recorded_paid_cents) || 0));
  const paidCents = invoice.status === "paid" ? total : Math.min(total, recorded);
  return { paidCents, remainingCents: invoice.status === "void" ? 0 : total - paidCents, partiallyPaid: invoice.status === "issued" && paidCents > 0 && paidCents < total };
}