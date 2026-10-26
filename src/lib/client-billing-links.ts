import { invoiceBalance } from "./invoice-balance";
import { periodKey } from "./payment-planning";

export function invoiceSourceMatches(invoice: { client_id: string; sales_quote_id?: string | null; acceptance_key?: string | null }, quote: { id: string; client_id: string | null; version: number; status: string }) {
  if (invoice.client_id !== quote.client_id || invoice.sales_quote_id !== quote.id) return false;
  if (!["approved", "sent", "signed"].includes(quote.status)) return false;
  if (invoice.acceptance_key?.startsWith("quote:")) return invoice.acceptance_key === `quote:${quote.id}:${quote.version}`;
  return true;
}
export function invoiceSowMatches(invoice: { client_id: string; sow_id?: string | null }, sow: { id: string; client_id: string | null; status: string }) {
  return invoice.sow_id === sow.id && invoice.client_id === sow.client_id && sow.status !== "draft";
}
export function acceptanceInvoiceMatches(invoice: { client_id: string; acceptance_key: string | null } | null, clientId: string | null, key: string) {
  return !!invoice && !!clientId && invoice.client_id === clientId && invoice.acceptance_key === key;
}
export function billingDate(date: string | null | undefined) {
  if (!date || !periodKey(date, "monthly")) return "Not set";
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
export function invoiceDueState(invoice: { due_date?: string | null; status?: string; total_cents?: unknown; recorded_paid_cents?: unknown }, today: string) {
  if (invoice.status !== "issued" || !invoiceBalance(invoice).remainingCents) return "settled";
  if (!invoice.due_date || !periodKey(invoice.due_date, "monthly")) return "not_set";
  return invoice.due_date < today ? "overdue" : invoice.due_date === today ? "due_today" : "upcoming";
}