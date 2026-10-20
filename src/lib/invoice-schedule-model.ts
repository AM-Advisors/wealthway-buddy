/** Pure billing-schedule and invoice-issue rules. No I/O. */
export type BillingFrequency = "one_time" | "monthly" | "quarterly" | "annual";
export const BILLING_FREQUENCIES: { id: BillingFrequency; label: string }[] = [
  { id: "one_time", label: "One-time" },
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "annual", label: "Annual" },
];
const MONTHS: Record<BillingFrequency, number> = { one_time: 0, monthly: 1, quarterly: 3, annual: 12 };

export const isFrequency = (v: unknown): v is BillingFrequency => typeof v === "string" && v in MONTHS;

/** Adds whole months, clamping to the last day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
const minusDay = (iso: string) => new Date(Date.parse(iso + "T00:00:00Z") - 86_400_000).toISOString().slice(0, 10);

/** The billing period that starts on `start`. One-time charges cover just that day. */
export function periodFor(freq: BillingFrequency, start: string) {
  if (freq === "one_time") return { start, end: start, next: null as string | null };
  const next = addMonths(start, MONTHS[freq]);
  return { start, end: minusDay(next), next };
}

/** Every period due on or before `today`, starting from `nextDue`. Bounded so a stale schedule can't run away. */
export function duePeriods(freq: BillingFrequency, nextDue: string | null, today: string, max = 24) {
  const out: { start: string; end: string; next: string | null }[] = [];
  let cur = nextDue;
  while (cur && cur <= today && out.length < max) {
    const p = periodFor(freq, cur);
    out.push(p);
    cur = p.next;
  }
  return out;
}

/** The stable key for one schedule period: an invoice line can only exist once per key. */
export const scheduleRef = (scheduleId: string, periodStart: string) => `schedule:${scheduleId}:${periodStart}`;

/**
 * Maker-checker on issuing: the person who drafted or reviewed a draft can't
 * issue it. A Super Admin may, with a reason that is kept permanently.
 */
export function issueBlocker(input: { issuerId: string; createdBy: string | null; reviewedBy: string | null; generatedBySchedule: boolean; isSuperAdmin: boolean; selfReason?: string | null }): string | null {
  const { issuerId, createdBy, reviewedBy, generatedBySchedule, isSuperAdmin } = input;
  if (generatedBySchedule && !reviewedBy) return "Someone needs to review this scheduled draft before it is issued.";
  const own = issuerId === createdBy || issuerId === reviewedBy;
  if (!own) return null;
  if (isSuperAdmin && (input.selfReason ?? "").trim().length >= 3) return null;
  return isSuperAdmin
    ? "Give a reason to issue an invoice you prepared or reviewed yourself."
    : "A different person must issue an invoice you prepared or reviewed.";
}
