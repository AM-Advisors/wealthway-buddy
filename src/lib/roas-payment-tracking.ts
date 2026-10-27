import { roasAnnualK1Charges } from "./roas-billing-terms";

export type TrackedInvoice = {
  id: string; number: string | null; status: string; totalCents: number;
  paidCents: number; remainingCents: number; paidOn: string | null;
  dueDate: string | null; periodStart: string | null; periodEnd: string | null;
};
export type TrackedLine = { id: string; invoiceId: string; label: string; serviceKey: string | null; amountCents: number };

/** Full invoice settlement evidences all its lines; partial receipts have no line allocation. */
export function k1PaymentStatus(invoice: TrackedInvoice) {
  if (invoice.status === "void") return { status: "Voided", paidOn: null };
  if (invoice.status === "paid" || (invoice.status === "issued" && invoice.remainingCents === 0 && invoice.paidCents >= invoice.totalCents && invoice.totalCents > 0)) return { status: "Paid", paidOn: invoice.paidOn };
  if (invoice.status === "issued" && invoice.paidCents > 0) return { status: "Allocation needed", paidOn: null };
  return { status: invoice.status === "issued" ? "Unpaid" : "Not issued", paidOn: null };
}

export function paymentTotals(invoices: TrackedInvoice[]) {
  return invoices.reduce((sum, invoice) => {
    if (!["issued", "paid"].includes(invoice.status)) return sum;
    return { billedCents: sum.billedCents + invoice.totalCents, receivedCents: sum.receivedCents + invoice.paidCents, balanceCents: sum.balanceCents + invoice.remainingCents };
  }, { billedCents: 0, receivedCents: 0, balanceCents: 0 });
}

export function trackedK1Sets(invoices: TrackedInvoice[], lines: TrackedLine[], year: number) {
  const byId = new Map(invoices.map(invoice => [invoice.id, invoice]));
  const sets = lines.filter(line => line.serviceKey === "tax_k1").flatMap(line => {
    const invoice = byId.get(line.invoiceId);
    if (!invoice) return [];
    const period = invoice.periodEnd ?? invoice.periodStart;
    // Due dates are not tax years. Missing service periods stay explicitly unassigned.
    if (period && Number(period.slice(0, 4)) !== year) return [];
    return [{ ...line, invoice, taxYear: period ? year : null, ...k1PaymentStatus(invoice) }];
  });
  return { sets, expected: roasAnnualK1Charges(year) };
}