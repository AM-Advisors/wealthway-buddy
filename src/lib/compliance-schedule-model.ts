export type ScheduleFrequency = 'weekly' | 'monthly' | 'quarterly';
export const REPORT_TYPES = { compliance_items_due: 'Compliance items due', open_holds: 'Open compliance holds', combined: 'Compliance items and holds' } as const;
export type ReportType = keyof typeof REPORT_TYPES;
/** Recipients must be Harmonious team addresses; reports never go outside the company. */
export function recipientAllowed(email: string) { return /^[^\s@]+@harmonious\.co$/i.test(email.trim()); }
export function nextRunOn(from: string, frequency: ScheduleFrequency): string {
  const d = new Date(`${from}T00:00:00Z`);
  if (frequency === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else { const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + (frequency === 'monthly' ? 1 : 3)); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); }
  return d.toISOString().slice(0, 10);
}
export type ComplianceItemRow = { status: string | null; due_date: string | null; filed_on: string | null };
export function complianceSummary(items: ComplianceItemRow[], openHolds: number, asOf: string) {
  const open = items.filter(i => !i.filed_on && i.status !== 'filed');
  const in30 = new Date(`${asOf}T00:00:00Z`); in30.setUTCDate(in30.getUTCDate() + 30); const horizon = in30.toISOString().slice(0, 10);
  return { asOf, openItems: open.length, overdue: open.filter(i => i.due_date && i.due_date < asOf).length, dueNext30Days: open.filter(i => i.due_date && i.due_date >= asOf && i.due_date <= horizon).length, openHolds };
}
