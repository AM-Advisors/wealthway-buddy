/**
 * Bookkeeping service options (pure, browser-safe).
 *
 * Three options under one Bookkeeping category, kept separate from Fund Accounting:
 *  - Self-Service: the client keeps the books with Harmonious tools.
 *  - Bookkeeping Review: the client keeps the books; Harmonious reviews on an agreed schedule.
 *  - Managed Bookkeeping: Harmonious keeps the books through the close.
 *
 * Service option, service frequency, support level (SLA) and billing frequency are four
 * independent selections. The SLA only describes how quickly Harmonious responds; it never
 * changes scope, review frequency or close deadlines. Nothing here prices, enrolls, bills
 * or schedules work; it only describes and checks a selection.
 */
import { SERVICE_LEVELS, type ServiceLevel } from "@/lib/service-level";

export type BookkeepingOption = "self_service" | "review" | "managed";
export type ServiceFrequency = "monthly" | "quarterly" | "annual";
export type Owner = "client" | "harmonious" | "not_included";

export const OPTION_KEYS: BookkeepingOption[] = ["self_service", "review", "managed"];

/** Activities that can appear in a responsibility table. */
export type Activity =
  | "provide_records" | "bank_statements" | "categorize" | "reconcile" | "journal_entries"
  | "close" | "reports" | "review" | "corrections" | "outstanding_items";

export const ACTIVITY_LABELS: Record<Activity, string> = {
  provide_records: "Provide records and answer questions",
  bank_statements: "Bring in bank and card statements",
  categorize: "Categorize transactions",
  reconcile: "Reconcile accounts",
  journal_entries: "Record journal entries",
  close: "Close each period",
  reports: "Produce financial reports",
  review: "Review the books on a schedule",
  corrections: "Make agreed corrections",
  outstanding_items: "Report outstanding items",
};

/**
 * Where a capability exists in the platform today.
 *  - "all": usable for any entity's books.
 *  - "funds": exists only for funds, SPVs and series today.
 *  - "missing": not built yet. Never shown to clients as available.
 */
export type Availability = "all" | "funds" | "missing";

export interface Capability { key: string; label: string; availability: Availability; note: string }

export interface OptionDefinition {
  key: BookkeepingOption;
  name: string;
  shortName: string;
  description: string;
  responsibilities: Record<Activity, Owner>;
  capabilities: Capability[];
  /** Service frequencies the option supports; empty when no Harmonious schedule applies. */
  frequencies: ServiceFrequency[];
  defaultFrequency: ServiceFrequency | null;
  /** Activities Harmonious charges for under this option (used for duplicate checks). */
  charged: ChargedScope[];
  disclaimer: string | null;
}

/** Billable scope units, used to detect duplicate coverage across agreements. */
export type ChargedScope = "tools" | "categorize" | "reconcile" | "journal_entries" | "close" | "reports" | "review" | "corrections";

export const CHARGED_LABELS: Record<ChargedScope, string> = {
  tools: "Bookkeeping tools",
  categorize: "Transaction categorization",
  reconcile: "Account reconciliation",
  journal_entries: "Journal entries",
  close: "Period close",
  reports: "Financial reports",
  review: "Scheduled review",
  corrections: "Agreed corrections",
};

export const BOOKKEEPING_OPTIONS: Record<BookkeepingOption, OptionDefinition> = {
  self_service: {
    key: "self_service",
    name: "Self-Service Bookkeeping",
    shortName: "Self-Service",
    description: "Manage your books with Harmonious tools. Your team handles transactions, reconciliations and closing.",
    responsibilities: {
      provide_records: "client", bank_statements: "client", categorize: "client", reconcile: "client",
      journal_entries: "client", close: "client", reports: "client", review: "not_included",
      corrections: "not_included", outstanding_items: "not_included",
    },
    capabilities: [
      { key: "statement_upload", label: "Bank statement upload and line assignment", availability: "funds", note: "Live bank connections are not part of this service." },
      { key: "categorization", label: "Transaction categorization", availability: "funds", note: "Assign statement lines to investors, investments or vendors." },
      { key: "reconciliation_tools", label: "Reconciliation tools", availability: "funds", note: "Match statement lines to recorded activity." },
      { key: "financial_reports", label: "Financial reports", availability: "funds", note: "Trial balance, general ledger and journal register from your books." },
    ],
    frequencies: [],
    defaultFrequency: null,
    charged: ["tools"],
    disclaimer: "Self-Service includes software and platform support only. Harmonious does not review your books, make corrections or guarantee their accuracy.",
  },
  review: {
    key: "review",
    name: "Bookkeeping Review",
    shortName: "Review",
    description: "Maintain your books with professional oversight. Harmonious reviews your records and addresses issues within your agreed scope.",
    responsibilities: {
      provide_records: "client", bank_statements: "client", categorize: "client", reconcile: "client",
      journal_entries: "client", close: "client", reports: "client", review: "harmonious",
      corrections: "harmonious", outstanding_items: "harmonious",
    },
    capabilities: [
      { key: "scheduled_review", label: "Review on your agreed schedule", availability: "all", note: "Your Harmonious team books each review; it is not scheduled automatically." },
      { key: "reconciliation_checks", label: "Reconciliation checks", availability: "funds", note: "Checked against recorded bank reconciliations." },
      { key: "agreed_corrections", label: "Agreed corrections", availability: "all", note: "Recorded as reviewed journal entries; nothing already posted is rewritten." },
      { key: "outstanding_items_report", label: "Outstanding-items report", availability: "funds", note: "Shows what we need from you and what we're working on, on your fund's Services page." },
    ],
    frequencies: ["monthly", "quarterly", "annual"],
    defaultFrequency: "quarterly",
    charged: ["review", "corrections"],
    disclaimer: null,
  },
  managed: {
    key: "managed",
    name: "Managed Bookkeeping",
    shortName: "Managed",
    description: "Let Harmonious keep your books and close each period, within the scope in your quote.",
    responsibilities: {
      provide_records: "client", bank_statements: "client", categorize: "harmonious", reconcile: "harmonious",
      journal_entries: "harmonious", close: "harmonious", reports: "harmonious", review: "harmonious",
      corrections: "harmonious", outstanding_items: "not_included",
    },
    capabilities: [
      { key: "categorization", label: "Transaction categorization", availability: "funds", note: "From uploaded statements." },
      { key: "reconciliation", label: "Account reconciliation", availability: "funds", note: "Recorded bank reconciliations." },
      { key: "journal_entries", label: "Journal entries", availability: "all", note: "Reviewed entries in your books." },
      { key: "monthly_close", label: "Monthly close", availability: "all", note: "Accounting periods with a close checklist." },
      { key: "financial_reports", label: "Financial reports", availability: "all", note: "Reviewed before they are shared." },
    ],
    frequencies: ["monthly", "quarterly"],
    defaultFrequency: "monthly",
    charged: ["categorize", "reconcile", "journal_entries", "close", "reports", "review", "corrections"],
    disclaimer: null,
  },
};

export const FREQUENCY_LABELS: Record<ServiceFrequency, string> = { monthly: "Monthly", quarterly: "Quarterly", annual: "Annual" };

export const isFundEntity = (entity: { entityType?: string | null; offeringId?: string | null }) =>
  Boolean(entity.offeringId) || ["fund", "spv", "series"].includes(String(entity.entityType ?? ""));

/** Capabilities a client may see for this entity: never the missing ones, and fund-only tools only for funds. */
export function visibleCapabilities(option: BookkeepingOption, entity: { entityType?: string | null; offeringId?: string | null }): Capability[] {
  const fund = isFundEntity(entity);
  return BOOKKEEPING_OPTIONS[option].capabilities.filter((c) => c.availability === "all" || (c.availability === "funds" && fund));
}

/** Capabilities that are not available for this entity, for internal reporting only. */
export function unavailableCapabilities(option: BookkeepingOption, entity: { entityType?: string | null; offeringId?: string | null }): Capability[] {
  const shown = new Set(visibleCapabilities(option, entity).map((c) => c.key));
  return BOOKKEEPING_OPTIONS[option].capabilities.filter((c) => !shown.has(c.key));
}

/** Whether the option can be offered for this entity today. Self-Service and Review depend on fund-only tools. */
export function optionAvailableFor(option: BookkeepingOption, entity: { entityType?: string | null; offeringId?: string | null }): { available: boolean; reason: string | null } {
  if (option === "managed" || isFundEntity(entity)) return { available: true, reason: null };
  return { available: false, reason: "The tools this option relies on are available for funds and SPVs today, not yet for this type of entity." };
}

/** Harmonious activities that depend on tools that exist only for funds, SPVs and series today. */
const FUND_ONLY_ACTIVITIES: Activity[] = ["categorize", "reconcile", "outstanding_items"];

export type RowOwner = Owner | "not_available";

/**
 * Responsibility rows a client may see. When an entity is given and it is not a fund, any
 * Harmonious activity that relies on fund-only tools shows as not available instead of promised.
 */
export function responsibilityRows(option: BookkeepingOption, entity?: { entityType?: string | null; offeringId?: string | null }): { activity: Activity; label: string; owner: RowOwner }[] {
  const def = BOOKKEEPING_OPTIONS[option];
  const fund = !entity || isFundEntity(entity);
  return (Object.keys(ACTIVITY_LABELS) as Activity[])
    .map((a) => {
      const owner = def.responsibilities[a];
      return { activity: a, label: ACTIVITY_LABELS[a], owner: owner === "harmonious" && !fund && FUND_ONLY_ACTIVITIES.includes(a) ? "not_available" as const : owner };
    });
}

/* ------------------------------------------------------------ frequency */

/** Validates the service frequency for an option. Self-Service has none; Managed defaults to monthly. */
export function resolveFrequency(option: BookkeepingOption, requested: ServiceFrequency | null | undefined): ServiceFrequency | null {
  const def = BOOKKEEPING_OPTIONS[option];
  if (def.frequencies.length === 0) {
    if (requested) throw new Error("Self-Service has no Harmonious review or close schedule.");
    return null;
  }
  const value = requested ?? def.defaultFrequency;
  if (!value) throw new Error("Choose how often Harmonious reviews your books.");
  if (!def.frequencies.includes(value)) throw new Error(`${def.shortName} is not offered on a ${value} schedule.`);
  return value;
}

/* ---------------------------------------------------------------- SLA */

const RESPONSE: Record<ServiceLevel, string> = {
  self_serve: "Operations inbox, response within 5 business days",
  core: "Response within 72 hours",
  plus: "Named contact, response within 48 hours",
  white_glove: "Named administrator, response within 24 hours",
  institutional: "Custom response times in your agreement",
};

export const SUPPORT_LEVELS = SERVICE_LEVELS.map((l) => ({ key: l.key, name: l.name, response: RESPONSE[l.key], included: l.key === "self_serve" }));

/** What the chosen support level covers for this option. Never changes scope or schedule. */
export function supportDescription(option: BookkeepingOption, level: ServiceLevel): { title: string; detail: string } {
  const l = SUPPORT_LEVELS.find((x) => x.key === level) ?? SUPPORT_LEVELS[0]!;
  if (option === "self_service") return { title: `Platform support · ${l.name}`, detail: `${l.response}. Covers help using the platform, not a review of your books.` };
  return { title: `Service communications · ${l.name}`, detail: `${l.response}, for questions and requests under your engagement. Your review or close schedule stays as agreed.` };
}

/* ------------------------------------------------------------- add-ons */

export type AddonKey = "initial_setup" | "historical_cleanup" | "bill_pay_invoicing" | "payroll" | "tax_preparation" | "cfo_advisory";

export const ADDONS: { key: AddonKey; name: string; description: string }[] = [
  { key: "initial_setup", name: "Initial setup", description: "Chart of accounts, opening balances and connecting your records." },
  { key: "historical_cleanup", name: "Historical cleanup and catch-up", description: "Bringing earlier periods up to date before regular service starts." },
  { key: "bill_pay_invoicing", name: "Bill pay and invoicing", description: "Preparing bills and customer invoices. Harmonious never sends payments automatically." },
  { key: "payroll", name: "Payroll", description: "Recording payroll in your books." },
  { key: "tax_preparation", name: "Tax preparation and filings", description: "Separately scoped tax work." },
  { key: "cfo_advisory", name: "CFO advice, budgeting and forecasting", description: "Planning and advice beyond bookkeeping." },
];

/* --------------------------------------------------------- scope limits */

export interface ScopeLimits {
  entities: number | null;
  financialAccounts: number | null;
  monthlyTransactions: number | null;
  accountingBases: ("cash" | "accrual")[];
  reporting: "standard" | "custom";
}

export interface ScopeActuals {
  entities: number; financialAccounts: number; monthlyTransactions: number;
  accountingBasis: "cash" | "accrual"; reporting: "standard" | "custom";
}

/** Reasons the selection is outside the configured limits. Any reason means a scope review and an approved quote before extra charges. */
export function scopeReviewReasons(limits: ScopeLimits, actual: ScopeActuals): string[] {
  const out: string[] = [];
  if (limits.entities !== null && actual.entities > limits.entities) out.push(`${actual.entities} entities (limit ${limits.entities})`);
  if (limits.financialAccounts !== null && actual.financialAccounts > limits.financialAccounts) out.push(`${actual.financialAccounts} bank and credit accounts (limit ${limits.financialAccounts})`);
  if (limits.monthlyTransactions !== null && actual.monthlyTransactions > limits.monthlyTransactions) out.push(`${actual.monthlyTransactions} monthly transactions (limit ${limits.monthlyTransactions})`);
  if (!limits.accountingBases.includes(actual.accountingBasis)) out.push(`${actual.accountingBasis} accounting basis`);
  if (actual.reporting === "custom" && limits.reporting === "standard") out.push("custom reporting");
  return out;
}

/* ---------------------------------------------------- work obligations */

export interface Obligation { kind: "review" | "close"; periodStart: string; periodEnd: string; dueOn: string | null }

const iso = (d: Date) => d.toISOString().slice(0, 10);
function addBusinessDays(fromIso: string, days: number) {
  const d = new Date(`${fromIso}T00:00:00Z`);
  for (let n = 0; n < days;) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return iso(d);
}

/**
 * The work Harmonious owes for a selection in a window. Self-Service owes nothing.
 * Review owes one review per agreed period; Managed owes one close per period.
 * The support level is intentionally not an input: it can't change this schedule.
 */
export function bookkeepingObligations(
  sel: { option: BookkeepingOption; frequency: ServiceFrequency | null; fiscalYearEndMonth?: number },
  window: { from: string; to: string },
  businessDays: { review: number | null; close: Record<ServiceFrequency, number | null> },
): Obligation[] {
  if (sel.option === "self_service") return [];
  const frequency = resolveFrequency(sel.option, sel.frequency);
  if (!frequency) return [];
  const months = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  const fyEnd = sel.fiscalYearEndMonth ?? 12;
  const out: Obligation[] = [];
  const start = new Date(`${window.from}T00:00:00Z`);
  // First period end on or after the window start, aligned to the fiscal year.
  let endMonth = start.getUTCMonth() + 1;
  let year = start.getUTCFullYear();
  while ((((endMonth - fyEnd) % months) + months) % months !== 0) { endMonth++; if (endMonth > 12) { endMonth = 1; year++; } }
  for (let guard = 0; guard < 240; guard++) {
    const periodEnd = iso(new Date(Date.UTC(year, endMonth, 0)));
    if (periodEnd > window.to) break;
    const periodStart = iso(new Date(Date.UTC(year, endMonth - months, 1)));
    if (periodEnd >= window.from) {
      const days = sel.option === "managed" ? businessDays.close[frequency] : businessDays.review;
      out.push({ kind: sel.option === "managed" ? "close" : "review", periodStart, periodEnd, dueOn: days === null ? null : addBusinessDays(periodEnd, days) });
    }
    endMonth += months;
    while (endMonth > 12) { endMonth -= 12; year++; }
  }
  return out;
}

/* ----------------------------------------------- coverage and duplicates */

/** Administration-agreement features that already cover bookkeeping scope for the same entity. */
export const ADMIN_FEATURE_SCOPE: Record<string, ChargedScope[]> = {
  BASIC_GL: ["tools", "categorize", "journal_entries"],
  GENERAL_LEDGER: ["tools", "categorize", "journal_entries"],
  BASIC_RECONCILIATION: ["tools", "reconcile"],
  BANK_RECONCILIATION: ["tools", "reconcile"],
  ENHANCED_RECONCILIATION: ["tools", "reconcile"],
  MONTHLY_CLOSE: ["close"],
  QUARTERLY_CLOSE: ["close"],
  ANNUAL_FINANCIAL_PACKAGE: ["reports"],
  YEAR_END_DATA_PACKAGE: ["reports"],
  SENIOR_ACCOUNTING_REVIEW: ["review"],
};

export interface CoverageRow {
  source: "administration" | "bookkeeping" | "request";
  label: string;
  scope: ChargedScope[];
  start: string | null;
  end: string | null;
}

export function addMonths(isoDate: string, months: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  d.setUTCDate(d.getUTCDate() - 1);
  return iso(d);
}

const overlaps = (a: { start: string | null; end: string | null }, b: { start: string; end: string }) =>
  (a.start === null || a.start <= b.end) && (a.end === null || a.end >= b.start);

/**
 * Compares a new selection with existing coverage for the same entity and period.
 * `duplicates` lists overlapping scope; `blocked` is true when everything the option would charge
 * is already covered, or when another bookkeeping engagement or request already exists.
 */
export function coverageConflicts(
  sel: { option: BookkeepingOption; effectiveOn: string; termMonths: number; excluded?: ChargedScope[] },
  coverage: CoverageRow[],
) {
  const period = { start: sel.effectiveOn, end: addMonths(sel.effectiveOn, sel.termMonths) };
  const charged = BOOKKEEPING_OPTIONS[sel.option].charged;
  const live = coverage.filter((c) => overlaps(c, period));
  const duplicates = live
    .map((c) => ({ label: c.label, source: c.source, scope: c.scope.filter((s) => charged.includes(s)) }))
    .filter((c) => c.scope.length > 0);
  const covered = new Set(duplicates.flatMap((d) => d.scope));
  const excluded = new Set(sel.excluded ?? []);
  const unresolved = [...covered].filter((s) => !excluded.has(s));
  const existingBookkeeping = live.find((c) => c.source === "bookkeeping" || c.source === "request") ?? null;
  const fullyCovered = charged.every((s) => covered.has(s));
  return {
    period,
    duplicates,
    covered: [...covered],
    /** Scope this option would still add; the only part a quote may price. */
    uncovered: charged.filter((s) => !covered.has(s)),
    unresolved,
    existingBookkeeping,
    blocked: Boolean(existingBookkeeping) || fullyCovered,
    reason: existingBookkeeping
      ? `${existingBookkeeping.label} already covers bookkeeping for this entity in this period. Change it through that engagement instead.`
      : fullyCovered ? "Everything this option includes is already covered for this entity in this period." : null,
  };
}

/* ------------------------------------------------------ Fund Accounting */

export type FundAccountingScope = "investment_accounting" | "nav" | "capital_accounts" | "management_fees" | "performance_allocations" | "fund_reporting";

export const FUND_ACCOUNTING_SCOPE: { key: FundAccountingScope; label: string; features: string[] }[] = [
  { key: "investment_accounting", label: "Investment accounting", features: ["INVESTMENT_ACCOUNTING", "SCHEDULE_OF_INVESTMENTS", "INVESTMENT_VALUE_TRACKING"] },
  { key: "nav", label: "Net asset value (NAV)", features: ["MONTHLY_NAV", "QUARTERLY_NAV"] },
  { key: "capital_accounts", label: "Investor capital accounts", features: ["CAPITAL_ACCOUNTS", "INVESTOR_CAPITAL_BALANCES", "CAPITAL_ACCOUNT_STATEMENTS"] },
  { key: "management_fees", label: "Management fee calculations", features: ["MANAGEMENT_FEE_CALC"] },
  { key: "performance_allocations", label: "Carried interest and performance allocations", features: ["STANDARD_WATERFALL", "COMPLEX_WATERFALL"] },
  { key: "fund_reporting", label: "Fund reporting", features: ["FUND_REPORTING", "BASIC_QUARTERLY_REPORTING", "INVESTOR_STATEMENTS"] },
];

/** Fund Accounting scope already included in a fund's administration agreement. */
export function fundAccountingCoverage(featureKeys: readonly string[]) {
  const have = new Set(featureKeys);
  return FUND_ACCOUNTING_SCOPE.map((s) => ({ key: s.key, label: s.label, included: s.features.some((f) => have.has(f)) }));
}

/** Only the Fund Accounting items the agreement actually includes; what clients see. */
export function includedFundAccounting(featureKeys: readonly string[]) {
  return fundAccountingCoverage(featureKeys).filter((s) => s.included);
}

/** Bookkeeping scope an administration agreement already covers. */
export function adminBookkeepingScope(featureKeys: readonly string[]): ChargedScope[] {
  return [...new Set(featureKeys.flatMap((k) => ADMIN_FEATURE_SCOPE[k] ?? []))];
}
