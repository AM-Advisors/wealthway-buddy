import { invoiceBalance } from "../invoice-balance";
import { invoiceSourceMatches, invoiceSowMatches } from "../client-billing-links";

export const QA_QUOTE = { id: "qa-quote-1", client_id: "qa-client", version: 1, status: "signed", number: "FABLE-Q001", title: "Fablewood administration", amountCents: 1200000 };
export const QA_SOW = { id: "qa-sow-1", client_id: "qa-client", status: "active", title: "Fablewood administration agreement", scope: "Quarterly administration for Fablewood Ventures I LP.", amountCents: 1200000 };
export const QA_INVOICE = {
  id: "qa-invoice-1", client_id: "qa-client", sales_quote_id: QA_QUOTE.id, sow_id: QA_SOW.id,
  acceptance_key: `quote:${QA_QUOTE.id}:${QA_QUOTE.version}`, number: "FABLE-I001", status: "issued",
  total_cents: 1200000, recorded_paid_cents: 450000, recorded_paid_on: "2026-10-12",
  issue_date: "2026-10-01", due_date: "2026-10-31", currency: "USD",
};
export function fictionalBillingReadback() {
  return { balance: invoiceBalance(QA_INVOICE), quoteLinked: invoiceSourceMatches(QA_INVOICE, QA_QUOTE), sowLinked: invoiceSowMatches(QA_INVOICE, QA_SOW) };
}