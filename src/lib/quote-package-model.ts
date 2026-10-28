/** Pure plan for the one-click quote package: every invoice an approved quote bills, with its own due date. No I/O. */
import { isFrequency, periodFor } from "@/lib/invoice-schedule-model";

export type PackageLine = { label: string; service_key?: string | null; line_cents: number | string; quantity?: number | string; billing_frequency?: string | null; first_bill_on?: string | null };
export type PackageInvoice = { lineIndex: number; label: string; serviceKey: string | null; amountCents: number; periodStart: string; periodEnd: string; dueOn: string; ref: string };

/** The package covers from the start date through December 31 of the following year. */
export const packageThrough = (start: string) => `${Number(start.slice(0, 4)) + 1}-12-31`;

/** One invoice per line per billing period, due at the start of its period. One-time lines bill once. */
export function packageInvoicePlan(quoteId: string, version: number, lines: PackageLine[], start: string, through = packageThrough(start)): PackageInvoice[] {
  const out: PackageInvoice[] = [];
  lines.forEach((l, i) => {
    const amount = Math.round(Number(l.line_cents) || 0);
    if (amount <= 0) return;
    const freq = isFrequency(l.billing_frequency) ? l.billing_frequency : "one_time";
    let cur: string | null = String(l.first_bill_on ?? start).slice(0, 10);
    for (let n = 0; cur && cur <= through && n < 60; n++) {
      const p = periodFor(freq, cur);
      out.push({ lineIndex: i, label: l.label, serviceKey: l.service_key ?? null, amountCents: amount, periodStart: p.start, periodEnd: p.end, dueOn: p.start, ref: `package:${quoteId}:v${version}:${i}:${p.start}` });
      cur = p.next;
    }
  });
  return out.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.lineIndex - b.lineIndex);
}

/** Only an approved (or already sent) quote with a client can go out as a package; the quote's approval is the second check. */
export function packageBlocker(q: { status: string; client_id: string | null; package_issued_at?: string | null }): string | null {
  if (q.package_issued_at) return "This quote's package was already sent.";
  if (!["approved", "sent"].includes(q.status)) return "Only an approved quote can be sent with its SOW and invoices.";
  if (!q.client_id) return "Choose the client before sending.";
  return null;
}
