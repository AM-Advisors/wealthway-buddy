export type ReportingCadence = "monthly" | "quarterly" | "annual";
export type PaymentCadence = "quarterly" | "annual";
export type PlanningPayment = { id: string; label: string; cents: number; date: string | null; status: string; currency?: string; lineId?: string; userId?: string | null; layer?: string };

export function periodKey(date: string, cadence: ReportingCadence): string | null {
  const day = date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return null;
  const year = day.slice(0, 4);
  const month = parsed.getUTCMonth() + 1;
  return cadence === "annual" ? year : cadence === "quarterly" ? `${year} Q${Math.ceil(month / 3)}` : day.slice(0, 7);
}

export function selectedPaymentTotals(rows: PlanningPayment[], ids: string[], cadence: ReportingCadence) {
  const selected = new Set(ids);
  const seen = new Set<string>();
  const groups = new Map<string, { period: string; currency: string; cents: number; count: number }>();
  for (const row of rows) {
    if (!selected.has(row.id) || seen.has(row.id) || !Number.isSafeInteger(row.cents) || ["void", "cancelled", "canceled", "rejected"].includes(row.status)) continue;
    seen.add(row.id);
    const period = row.date ? periodKey(row.date, cadence) ?? "Undated" : "Undated";
    const currency = row.currency ?? "USD";
    const key = `${period}|${currency}`;
    const group = groups.get(key) ?? { period, currency, cents: 0, count: 0 };
    group.cents += row.cents; group.count++;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.period.localeCompare(b.period) || a.currency.localeCompare(b.currency));
}

/** Planning dates only; never split an issued invoice or initiate a payment. */
export function paymentPlanDates(first: string, cadence: PaymentCadence): string[] {
  if (!periodKey(first, "monthly")) throw new Error("Choose a valid first payment date.");
  const start = new Date(`${first}T00:00:00Z`);
  return Array.from({ length: cadence === "annual" ? 1 : 4 }, (_, i) => {
    const target = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i * 3, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(start.getUTCDate(), last));
    return target.toISOString().slice(0, 10);
  });
}