/**
 * Canonical accounting and reporting vocabulary.
 *
 * Every number Harmonious publishes — NAV, capital accounts, financial
 * statements, performance, tax allocations, cap table reports — resolves back
 * to these definitions. Report builders must not invent their own states,
 * account names or period rules.
 */

export const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_SUBTYPES = [
  "cash",
  "investments",
  "receivable",
  "payable",
  "accrued_expense",
  "management_fee",
  "organizational_expense",
  "realized_gain",
  "unrealized_gain",
  "investment_income",
  "interest",
  "dividend",
  "contribution",
  "distribution",
  "carried_interest",
  "partner_capital",
  "withholding",
  "tax_adjustment",
  "other",
] as const;
export type AccountSubtype = (typeof ACCOUNT_SUBTYPES)[number];

export type ChartSeed = {
  code: string;
  name: string;
  account_type: AccountType;
  subtype: AccountSubtype;
  normal_balance: "debit" | "credit";
};

/** The starting chart of accounts every new fund book is opened with. */
export const DEFAULT_FUND_CHART: ChartSeed[] = [
  { code: "1000", name: "Cash at bank", account_type: "asset", subtype: "cash", normal_balance: "debit" },
  { code: "1100", name: "Investments at cost", account_type: "asset", subtype: "investments", normal_balance: "debit" },
  { code: "1110", name: "Unrealised appreciation", account_type: "asset", subtype: "unrealized_gain", normal_balance: "debit" },
  { code: "1200", name: "Subscriptions receivable", account_type: "asset", subtype: "receivable", normal_balance: "debit" },
  { code: "2000", name: "Accounts payable", account_type: "liability", subtype: "payable", normal_balance: "credit" },
  { code: "2100", name: "Accrued expenses", account_type: "liability", subtype: "accrued_expense", normal_balance: "credit" },
  { code: "2200", name: "Accrued management fee", account_type: "liability", subtype: "management_fee", normal_balance: "credit" },
  { code: "2300", name: "Accrued carried interest", account_type: "liability", subtype: "carried_interest", normal_balance: "credit" },
  { code: "2400", name: "Withholding payable", account_type: "liability", subtype: "withholding", normal_balance: "credit" },
  { code: "3000", name: "Partner capital", account_type: "equity", subtype: "partner_capital", normal_balance: "credit" },
  { code: "3100", name: "Capital contributions", account_type: "equity", subtype: "contribution", normal_balance: "credit" },
  { code: "3200", name: "Distributions", account_type: "equity", subtype: "distribution", normal_balance: "debit" },
  { code: "4000", name: "Investment income", account_type: "income", subtype: "investment_income", normal_balance: "credit" },
  { code: "4100", name: "Interest income", account_type: "income", subtype: "interest", normal_balance: "credit" },
  { code: "4200", name: "Dividend income", account_type: "income", subtype: "dividend", normal_balance: "credit" },
  { code: "4300", name: "Realised gain / loss", account_type: "income", subtype: "realized_gain", normal_balance: "credit" },
  { code: "4400", name: "Unrealised gain / loss", account_type: "income", subtype: "unrealized_gain", normal_balance: "credit" },
  { code: "5000", name: "Management fee expense", account_type: "expense", subtype: "management_fee", normal_balance: "debit" },
  { code: "5100", name: "Organisational expenses", account_type: "expense", subtype: "organizational_expense", normal_balance: "debit" },
  { code: "5200", name: "Fund operating expenses", account_type: "expense", subtype: "other", normal_balance: "debit" },
  { code: "5300", name: "Tax adjustments", account_type: "expense", subtype: "tax_adjustment", normal_balance: "debit" },
];

// ------------------------------------------------------------------- periods

export const PERIOD_STATUSES = ["open", "soft_closed", "review", "closed", "locked"] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

const PERIOD_TRANSITIONS: Record<PeriodStatus, PeriodStatus[]> = {
  open: ["soft_closed"],
  soft_closed: ["review", "open"],
  review: ["closed", "soft_closed"],
  closed: ["locked", "open"], // reopening requires a reason and admin authority
  locked: ["open"], // reopening a locked period requires a reason and admin authority
};

/** Statuses that refuse new postings until an authorised reopen happens. */
export const SEALED_PERIOD_STATUSES: PeriodStatus[] = ["closed", "locked"];

export function canTransitionPeriod(from: PeriodStatus, to: PeriodStatus) {
  return PERIOD_TRANSITIONS[from].includes(to);
}

/** Reopening a sealed period always needs a stated reason. */
export function reopenRequiresReason(from: PeriodStatus, to: PeriodStatus) {
  return SEALED_PERIOD_STATUSES.includes(from) && to === "open";
}

// ------------------------------------------------------------------ journals

export const JOURNAL_STATUSES = ["draft", "reviewed", "approved", "posted", "reversed"] as const;
export type JournalStatus = (typeof JOURNAL_STATUSES)[number];

const JOURNAL_TRANSITIONS: Record<JournalStatus, JournalStatus[]> = {
  draft: ["reviewed"],
  reviewed: ["approved", "draft"],
  approved: ["posted", "reviewed"],
  posted: ["reversed"],
  reversed: [],
};

export function canTransitionJournal(from: JournalStatus, to: JournalStatus) {
  return JOURNAL_TRANSITIONS[from].includes(to);
}

export type DraftLine = {
  accountId: string;
  debitCents?: number;
  creditCents?: number;
  offeringId?: string | null;
  clientEntityId?: string | null;
  investmentId?: string | null;
  investorUserId?: string | null;
  investmentProfileId?: string | null;
  applicationId?: string | null;
  memo?: string | null;
};

export function totals(lines: DraftLine[]) {
  return lines.reduce(
    (acc, l) => ({
      debit: acc.debit + (l.debitCents ?? 0),
      credit: acc.credit + (l.creditCents ?? 0),
    }),
    { debit: 0, credit: 0 },
  );
}

export function isBalanced(lines: DraftLine[]) {
  const { debit, credit } = totals(lines);
  return lines.length >= 2 && debit > 0 && debit === credit;
}

export function assertBalanced(lines: DraftLine[]) {
  for (const line of lines) {
    const debit = line.debitCents ?? 0;
    const credit = line.creditCents ?? 0;
    if (debit < 0 || credit < 0) throw new Error("Journal amounts cannot be negative.");
    if (debit > 0 && credit > 0) {
      throw new Error("A journal line is either a debit or a credit, never both.");
    }
  }
  if (!isBalanced(lines)) {
    const { debit, credit } = totals(lines);
    throw new Error(`Journal entry does not balance: debits ${debit} vs credits ${credit}.`);
  }
}

// ----------------------------------------------------------- reconciliation

export const RECONCILIATION_FLOW = [
  "ingested",
  "auto_matched",
  "harmonious_reviewed",
  "acknowledged",
  "reconciled",
  "posted",
] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_FLOW)[number] | "rejected";

export function canAdvanceReconciliation(from: ReconciliationStatus, to: ReconciliationStatus) {
  if (to === "rejected") return from !== "posted";
  const a = RECONCILIATION_FLOW.indexOf(from as any);
  const b = RECONCILIATION_FLOW.indexOf(to as any);
  if (a < 0 || b < 0) return false;
  return b === a + 1 || (to === "reconciled" && from === "harmonious_reviewed");
}

// ----------------------------------------------------------------- reporting

export const REPORT_STATUSES = ["draft", "review", "approved", "published", "superseded"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const FUND_REPORT_TYPES = [
  "balance_sheet",
  "income_statement",
  "changes_in_capital",
  "cash_flow",
  "schedule_of_investments",
  "trial_balance",
  "general_ledger",
  "capital_account_statement",
  "lp_statement",
  "performance",
  "management_fee",
  "carry_waterfall",
  "commitment_schedule",
  "unfunded_commitments",
  "capital_call_history",
  "distribution_history",
  "investor_roster",
  "investor_ownership",
  "cash_activity",
  "expense_report",
  "gain_report",
  "valuation_report",
  "withholding_report",
  "audit_support",
  "regulatory_export",
] as const;

export const CAP_TABLE_REPORT_TYPES = [
  "cap_table_current",
  "cap_table_fully_diluted",
  "stakeholder_statement",
  "security_ledger",
  "transaction_history",
  "option_vesting_report",
  "financing_round_report",
  "dilution_analysis",
] as const;

export type ReportType =
  | (typeof FUND_REPORT_TYPES)[number]
  | (typeof CAP_TABLE_REPORT_TYPES)[number];

export type ReportDomain = "fund_accounting" | "cap_table";

/**
 * Cap table ownership and fund capital accounts are separate accounting
 * domains. They share the report registry, never the calculations.
 */
export function domainForReport(type: ReportType): ReportDomain {
  return (CAP_TABLE_REPORT_TYPES as readonly string[]).includes(type)
    ? "cap_table"
    : "fund_accounting";
}

export function isReportType(value: string): value is ReportType {
  return (
    (FUND_REPORT_TYPES as readonly string[]).includes(value) ||
    (CAP_TABLE_REPORT_TYPES as readonly string[]).includes(value)
  );
}

const REPORT_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  draft: ["review"],
  review: ["approved", "draft"],
  approved: ["published", "review"],
  published: ["superseded"],
  superseded: [],
};

export function canTransitionReport(from: ReportStatus, to: ReportStatus) {
  return REPORT_TRANSITIONS[from].includes(to);
}

/** Fields a published report must carry to be reproducible later. */
export const REQUIRED_REPORT_PROVENANCE = [
  "report_type",
  "book_id",
  "period_end",
  "version",
  "source_cutoff_at",
  "methodology_version",
  "generated_by",
  "generated_at",
  "approved_by",
  "published_by",
  "published_at",
  "accounting_snapshot",
] as const;

export function missingProvenance(report: Record<string, unknown>) {
  return REQUIRED_REPORT_PROVENANCE.filter((field) => {
    const value = report[field];
    return value === null || value === undefined || value === "";
  });
}

// ----------------------------------------------------------------- capital

export type CapitalActivity = {
  beginningCapitalCents: number;
  contributionsCents: number;
  allocatedIncomeCents: number;
  allocatedLossCents: number;
  distributionsCents: number;
  otherAdjustmentsCents: number;
};

/** Beginning + contributions + income − loss − distributions ± adjustments. */
export function endingCapitalCents(a: CapitalActivity) {
  return (
    a.beginningCapitalCents +
    a.contributionsCents +
    a.allocatedIncomeCents -
    a.allocatedLossCents -
    a.distributionsCents +
    a.otherAdjustmentsCents
  );
}

// --------------------------------------------------------------------- tax

export const TAX_STATUSES = [
  "not_started",
  "in_progress",
  "harmonious_review",
  "client_review",
  "approved",
  "complete",
  "not_applicable",
] as const;
export type TaxStatus = (typeof TAX_STATUSES)[number];

/** Preparation, filing and investor delivery advance independently. */
export const TAX_TRACKS = ["allocations_status", "preparation_status", "filing_status", "delivery_status"] as const;

export const TAX_FORM_TYPES = [
  "form_1065",
  "schedule_k1",
  "form_1042",
  "form_1042s",
  "form_1099",
  "state_composite",
  "other",
] as const;

export const TAX_DOCUMENTATION_FORMS = [
  "w9",
  "w8ben",
  "w8bene",
  "w8imy",
  "w8eci",
  "w8exp",
  "none_on_file",
  "other",
] as const;

/** A K-1 can only be drafted once the accounting period behind it is closed. */
export function k1Ready(period: { status: PeriodStatus }, filing: { allocations_status: TaxStatus }) {
  return (
    SEALED_PERIOD_STATUSES.includes(period.status) &&
    ["approved", "complete"].includes(filing.allocations_status)
  );
}
