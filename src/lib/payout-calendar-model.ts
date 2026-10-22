/** Pure, display-only grouping of commission rows into calendar events. Never payable. */
export type CalendarStatus = "expected" | "scheduled" | "paid_out" | "cancelled";
export interface CalendarRow { quoteId: string; client: string; service: string; name?: string; layer: string; amountCents: number; status: string; payoutDue: string | null; frequency?: "quarterly" | "annual" | null; periodStart?: string | null }
export interface CalendarSow { id: string; label: string; client?: string; signedAt: string | null }
export interface PayoutDay { date: string; totals: Partial<Record<CalendarStatus, number>>; rows: CalendarRow[] }
export interface PeriodSpan { key: string; quoteId: string; client: string; service: string; frequency: "quarterly" | "annual"; start: string; end: string; amountCents: number }
export interface SignedMark { date: string; quoteId: string; label: string; client: string }

const SHOWN: readonly string[] = ["expected", "scheduled", "paid_out", "cancelled"];

export function periodEnd(start: string, frequency: "quarterly" | "annual"): string {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + (frequency === "quarterly" ? 3 : 12));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function buildPayoutCalendar(rows: readonly CalendarRow[], sows: readonly CalendarSow[], range: { from: string; to: string }) {
  const inRange = (d: string) => d >= range.from && d <= range.to;
  const days = new Map<string, PayoutDay>();
  const spans = new Map<string, PeriodSpan>();
  for (const r of rows) {
    if (r.payoutDue && SHOWN.includes(r.status) && inRange(r.payoutDue)) {
      const day = days.get(r.payoutDue) ?? { date: r.payoutDue, totals: {}, rows: [] };
      const s = r.status as CalendarStatus;
      day.totals[s] = (day.totals[s] ?? 0) + r.amountCents;
      day.rows.push(r);
      days.set(r.payoutDue, day);
    }
    if (r.frequency && r.periodStart) {
      const end = periodEnd(r.periodStart, r.frequency);
      if (end < range.from || r.periodStart > range.to) continue;
      const key = `${r.quoteId}:${r.service}:${r.periodStart}`;
      if (!spans.has(key)) spans.set(key, { key, quoteId: r.quoteId, client: r.client, service: r.service, frequency: r.frequency, start: r.periodStart < range.from ? range.from : r.periodStart, end: end > range.to ? range.to : end, amountCents: 0 });
    }
  }
  // Billed amount is per period, not per commission split: count each period once.
  const billed = new Map<string, number>();
  for (const r of rows as (CalendarRow & { baseCents?: number })[]) if (r.frequency && r.periodStart) billed.set(`${r.quoteId}:${r.service}:${r.periodStart}`, r.baseCents ?? 0);
  for (const s of spans.values()) s.amountCents = billed.get(s.key) ?? 0;
  const signed: SignedMark[] = sows.filter(s => s.signedAt && inRange(s.signedAt.slice(0, 10))).map(s => ({ date: s.signedAt!.slice(0, 10), quoteId: s.id, label: s.label, client: s.client ?? "-" }));
  return { days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), spans: [...spans.values()].sort((a, b) => a.start.localeCompare(b.start)), signed };
}
