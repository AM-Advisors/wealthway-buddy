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

/** Optional report sections; names only, never identity numbers, documents or bank details. */
export const REPORT_SECTIONS = { kyc_aml: 'KYC/AML status', filing_deadlines: 'Filing deadlines', fund_deadlines: 'Fund deadlines', kyb_missing: 'KYB missing info' } as const;
export type ReportSection = keyof typeof REPORT_SECTIONS;
export type SectionResult = { key: ReportSection; title: string; count: number; lines: string[] };

export function isInternalRecipient(email: string) { return recipientAllowed(email); }
export type OutsideRecipient = { email: string; reason: string; confirmed: boolean };
/** Outside addresses each need an explicit confirmation and a reason. */
export function validateOutsideRecipients(list: OutsideRecipient[]) {
  for (const r of list) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())) throw new Error(`Invalid email: ${r.email}`);
    if (isInternalRecipient(r.email)) throw new Error(`${r.email} is a Harmonious address; add it as a normal recipient.`);
    if (!r.confirmed) throw new Error(`Confirm sending to outside address ${r.email}.`);
    if (r.reason.trim().length < 3) throw new Error(`Give a reason for sending to ${r.email}.`);
  }
  return list.map((r) => ({ email: r.email.trim().toLowerCase(), reason: r.reason.trim() }));
}
/** Outside recipients get counts only — every name is removed. */
export function redactForOutside(sections: SectionResult[]): SectionResult[] { return sections.map((s) => ({ ...s, lines: [] })); }

const inDays = (d: string, asOf: string) => (Date.parse(d) - Date.parse(asOf)) / 86400000;
export function filingDeadlines(items: { label: string | null; category: string | null; status: string | null; due_date: string | null; filed_on: string | null; fund: string }[], asOf: string): SectionResult {
  const open = items.filter((i) => i.due_date && !i.filed_on && !['filed', 'complete', 'completed', 'not_applicable'].includes(String(i.status)) && inDays(i.due_date, asOf) <= 30);
  const lines = open.sort((a, b) => a.due_date!.localeCompare(b.due_date!)).map((i) => `${i.fund}: ${i.label ?? i.category ?? 'Filing'} · ${inDays(i.due_date!, asOf) < 0 ? 'overdue' : 'due'} ${i.due_date}`);
  return { key: 'filing_deadlines', title: REPORT_SECTIONS.filing_deadlines, count: open.length, lines: lines.slice(0, 25) };
}
export function fundDeadlines(rows: { fund: string; label: string; date: string | null }[], asOf: string): SectionResult {
  const due = rows.filter((r) => r.date && inDays(r.date, asOf) >= 0 && inDays(r.date, asOf) <= 30).sort((a, b) => a.date!.localeCompare(b.date!));
  return { key: 'fund_deadlines', title: REPORT_SECTIONS.fund_deadlines, count: due.length, lines: due.map((r) => `${r.fund}: ${r.label} ${r.date}`).slice(0, 25) };
}
export function kycAml(rows: { status: string | null; name: string | null }[]): SectionResult {
  const open = rows.filter((r) => ['pending', 'review', 'in_review', 'declined'].includes(String(r.status)));
  return { key: 'kyc_aml', title: REPORT_SECTIONS.kyc_aml, count: open.length, lines: open.map((r) => `${r.name ?? 'Unnamed person'}: ${r.status === 'review' ? 'in review' : r.status}`).slice(0, 25) };
}
export function kybMissing(rows: { name: string | null; since: string | null }[], asOf: string): SectionResult {
  return { key: 'kyb_missing', title: REPORT_SECTIONS.kyb_missing, count: rows.length, lines: rows.map((r) => `${r.name ?? 'Entity'}: waiting ${r.since ? Math.max(0, Math.floor(-inDays(r.since.slice(0, 10), asOf))) : '?'} days`).slice(0, 25) };
}
