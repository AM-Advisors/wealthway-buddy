/**
 * Default recurring calendar rules, keyed by service entitlement (feature_key) — never by tier name.
 * A fund gets a template only when its Service Engagement entitles that feature; every resulting
 * per-fund rule is editable (cadence, offsets, task lead time, active), so no deadline is global.
 */
export type Cadence = "MONTHLY" | "QUARTERLY" | "ANNUAL";
export type CalendarCategory = "ACCOUNTING" | "NAV" | "INVESTOR" | "CAPITAL" | "REPORTING" | "TAX" | "REGULATORY" | "AUDIT" | "ENTITY" | "BANKING" | "OTHER";

export const CALENDAR_CATEGORIES: Record<CalendarCategory, string> = {
  ACCOUNTING: "Accounting", NAV: "NAV", INVESTOR: "Investor", CAPITAL: "Capital", REPORTING: "Reporting", TAX: "Tax",
  REGULATORY: "Regulatory", AUDIT: "Audit", ENTITY: "Entity", BANKING: "Banking", OTHER: "Other",
};

export type CalendarTemplate = {
  key: string; feature: string; title: string; category: CalendarCategory; cadence: Cadence;
  /** Days after period end (monthly/quarterly). */ offset?: number;
  /** Fixed date for annual items (overridable per fund). */ month?: number; day?: number;
  team: string; task: boolean; lead: number;
};

export const CALENDAR_TEMPLATES: CalendarTemplate[] = [
  { key: "bank_rec_monthly", feature: "BANK_RECONCILIATION", title: "Bank reconciliation", category: "ACCOUNTING", cadence: "MONTHLY", offset: 15, team: "finance", task: true, lead: 10 },
  { key: "monthly_close", feature: "MONTHLY_CLOSE", title: "Monthly close", category: "ACCOUNTING", cadence: "MONTHLY", offset: 20, team: "finance", task: true, lead: 10 },
  { key: "quarterly_close", feature: "QUARTERLY_CLOSE", title: "Quarterly close", category: "ACCOUNTING", cadence: "QUARTERLY", offset: 30, team: "finance", task: true, lead: 14 },
  { key: "mgmt_fee_quarterly", feature: "MANAGEMENT_FEE_CALC", title: "Management fee calculation", category: "ACCOUNTING", cadence: "QUARTERLY", offset: 10, team: "finance", task: true, lead: 7 },
  { key: "monthly_nav", feature: "MONTHLY_NAV", title: "Monthly NAV", category: "NAV", cadence: "MONTHLY", offset: 25, team: "finance", task: true, lead: 10 },
  { key: "quarterly_nav", feature: "QUARTERLY_NAV", title: "Quarterly NAV", category: "NAV", cadence: "QUARTERLY", offset: 45, team: "finance", task: true, lead: 10 },
  { key: "quarterly_reporting", feature: "FUND_REPORTING", title: "Quarterly investor reporting", category: "REPORTING", cadence: "QUARTERLY", offset: 45, team: "operations", task: true, lead: 14 },
  { key: "capital_statements", feature: "CAPITAL_ACCOUNT_STATEMENTS", title: "Capital account statements", category: "INVESTOR", cadence: "QUARTERLY", offset: 45, team: "finance", task: false, lead: 10 },
  { key: "investor_exceptions", feature: "INVESTOR_EXCEPTION_MANAGEMENT", title: "Investor exception review", category: "INVESTOR", cadence: "MONTHLY", offset: 10, team: "operations", task: true, lead: 5 },
  { key: "treasury_review", feature: "TREASURY_COORDINATION", title: "Treasury review", category: "BANKING", cadence: "MONTHLY", offset: 10, team: "finance", task: false, lead: 5 },
  { key: "operating_review", feature: "PROACTIVE_OPERATING_CALENDAR", title: "Operating review", category: "OTHER", cadence: "QUARTERLY", offset: 20, team: "operations", task: true, lead: 10 },
  { key: "annual_tax", feature: "TAX_COORDINATION", title: "Annual tax package (1065 / K-1s)", category: "TAX", cadence: "ANNUAL", month: 3, day: 15, team: "finance", task: true, lead: 45 },
  { key: "annual_audit", feature: "AUDIT_COORDINATION", title: "Annual audit cycle", category: "AUDIT", cadence: "ANNUAL", month: 4, day: 30, team: "finance", task: true, lead: 60 },
  { key: "regulatory_annual", feature: "REGULATORY_CALENDAR", title: "Annual regulatory filings review (e.g. Form ADV)", category: "REGULATORY", cadence: "ANNUAL", month: 3, day: 31, team: "compliance", task: true, lead: 30 },
  { key: "entity_annual", feature: "ENTITY_COMPLIANCE_CALENDAR", title: "Entity annual report & franchise tax", category: "ENTITY", cadence: "ANNUAL", month: 6, day: 1, team: "operations", task: true, lead: 30 },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const monthEnd = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0));

export type RuleShape = { cadence: Cadence; due_day_offset: number; annual_month?: number | null; annual_day?: number | null };

/** Occurrences (period label + due date) with due dates in [from, to]. Pure. */
export function occurrences(rule: RuleShape, from: string, to: string): { period: string; due: string }[] {
  const out: { period: string; due: string }[] = [];
  const start = new Date(`${from}T00:00:00Z`); const end = new Date(`${to}T00:00:00Z`);
  for (let y = start.getUTCFullYear() - 1; y <= end.getUTCFullYear() + 1; y++) {
    if (rule.cadence === "ANNUAL") {
      const m = (rule.annual_month ?? 3) - 1; const lastDay = monthEnd(y, m).getUTCDate();
      const due = new Date(Date.UTC(y, m, Math.min(rule.annual_day ?? 15, lastDay)));
      out.push({ period: `FY${y - 1}`, due: iso(due) });
    } else if (rule.cadence === "QUARTERLY") {
      for (let q = 0; q < 4; q++) out.push({ period: `Q${q + 1} ${y}`, due: iso(addDays(monthEnd(y, q * 3 + 2), rule.due_day_offset)) });
    } else {
      for (let m = 0; m < 12; m++) out.push({ period: `${y}-${String(m + 1).padStart(2, "0")}`, due: iso(addDays(monthEnd(y, m), rule.due_day_offset)) });
    }
  }
  return out.filter((o) => o.due >= from && o.due <= to).sort((a, b) => a.due.localeCompare(b.due));
}

/** Whether a calendar item's task should exist yet. */
export const taskDue = (due: string, leadDays: number, today: string) => iso(addDays(new Date(`${due}T00:00:00Z`), -leadDays)) <= today;
