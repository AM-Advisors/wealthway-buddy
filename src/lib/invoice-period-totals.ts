import { invoiceBalance } from "./invoice-balance";
import { periodKey, type ReportingCadence } from "./payment-planning";
export type ReportInvoice = { id: string; total_cents?: unknown; status?: string; recorded_paid_cents?: unknown; recorded_paid_on?: string | null; paid_on?: string | null; issue_date?: string | null; due_date?: string | null; currency?: string };
/** Billed amounts use issue dates; receipts use recorded payment dates; balances use due dates. */
export function invoicePeriodTotals(invoices: ReportInvoice[], ids: string[], cadence: ReportingCadence) {
  const selected = new Set(ids), seen = new Set<string>();
  const groups = new Map<string, { period: string; currency: string; billedCents: number; paidCents: number; remainingCents: number }>();
  for (const inv of invoices) {
    if (!selected.has(inv.id) || seen.has(inv.id) || ["draft", "void", "cancelled"].includes(inv.status ?? "")) continue;
    seen.add(inv.id);
    const balance = invoiceBalance(inv), currency = inv.currency ?? "USD";
    const add = (date: string | null | undefined, field: "billedCents" | "paidCents" | "remainingCents", cents: number) => {
      if (!cents) return;
      const period = date ? periodKey(date, cadence) ?? "Undated" : "Undated";
      const key = `${period}|${currency}`;
      const group = groups.get(key) ?? { period, currency, billedCents: 0, paidCents: 0, remainingCents: 0 };
      group[field] += cents; groups.set(key, group);
    };
    add(inv.issue_date, "billedCents", Math.max(0, Math.round(Number(inv.total_cents) || 0)));
    add(inv.status === "paid" ? inv.paid_on : inv.recorded_paid_on, "paidCents", balance.paidCents);
    add(inv.due_date ?? inv.issue_date, "remainingCents", balance.remainingCents);
  }
  return [...groups.values()].sort((a, b) => a.period.localeCompare(b.period) || a.currency.localeCompare(b.currency));
}