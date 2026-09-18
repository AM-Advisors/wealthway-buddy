/**
 * Pure financial reporting rules.
 *
 * Statements are *presentations* of records that already exist: posted ledger
 * lines, approved valuations, finalized allocations. Nothing in this module
 * invents a figure — it maps, totals, compares and checks. Every rule here is
 * testable without a database, and the server engine is the only caller that
 * may persist what these functions produce.
 */

import type { AccountSubtype, AccountType } from "@/lib/accounting-model";

// --------------------------------------------------------------- basis

export const REPORTING_BASES = ["accrual", "cash", "modified"] as const;
export type ReportingBasis = (typeof REPORTING_BASES)[number];

export const BASIS_LABELS: Record<ReportingBasis, string> = {
  accrual: "Accrual",
  cash: "Cash",
  modified: "Modified / fund-specific",
};

export function isReportingBasis(value: string): value is ReportingBasis {
  return (REPORTING_BASES as readonly string[]).includes(value);
}

/** Only an accrual presentation is required to tie exactly to the approved NAV. */
export function navTieRequired(basis: ReportingBasis) {
  return basis === "accrual";
}

// ------------------------------------------------------------- statements

export const STATEMENTS = [
  "balance_sheet",
  "income_statement",
  "changes_in_capital",
  "cash_flow",
  "schedule_of_investments",
  "trial_balance",
  "general_ledger",
  "journal_register",
  "cash_activity",
  "realized_gains",
  "unrealized_gains",
  "expense_detail",
  "management_fee_detail",
  "investor_capital_reconciliation",
] as const;
export type StatementKind = (typeof STATEMENTS)[number];

export const STATEMENT_LABELS: Record<StatementKind, string> = {
  balance_sheet: "Statement of assets and liabilities",
  income_statement: "Statement of operations",
  changes_in_capital: "Statement of changes in partners' capital",
  cash_flow: "Statement of cash flows",
  schedule_of_investments: "Schedule of investments",
  trial_balance: "Trial balance",
  general_ledger: "General ledger detail",
  journal_register: "Journal register",
  cash_activity: "Cash activity",
  realized_gains: "Realised gain / loss",
  unrealized_gains: "Unrealised gain / loss",
  expense_detail: "Expense detail",
  management_fee_detail: "Management fee detail",
  investor_capital_reconciliation: "Investor capital reconciliation",
};

/** Statements Harmonious keeps internal unless deliberately shared. */
export const INTERNAL_ONLY_STATEMENTS: StatementKind[] = [
  "trial_balance",
  "general_ledger",
  "journal_register",
  "expense_detail",
  "investor_capital_reconciliation",
];

export function investorMaySee(statement: StatementKind) {
  return !INTERNAL_ONLY_STATEMENTS.includes(statement);
}

// --------------------------------------------------------- account mapping

export type MappingMatch = {
  /** Explicit account codes always win over broader rules. */
  codes?: string[];
  subtypes?: AccountSubtype[];
  types?: AccountType[];
};

export type MappingLine = {
  statement: Extract<StatementKind, "balance_sheet" | "income_statement" | "cash_flow">;
  section: string;
  key: string;
  label: string;
  order: number;
  /** +1 presents the account's natural balance, −1 flips it (e.g. distributions). */
  sign?: 1 | -1;
  match: MappingMatch;
};

export type StatementMapping = {
  version: number;
  basis: ReportingBasis;
  lines: MappingLine[];
};

/** The starting mapping every fund is configured with; never hard-coded downstream. */
export const DEFAULT_MAPPING_LINES: MappingLine[] = [
  // Assets
  { statement: "balance_sheet", section: "assets", key: "cash", label: "Cash and cash equivalents", order: 10, match: { subtypes: ["cash"] } },
  { statement: "balance_sheet", section: "assets", key: "investments", label: "Investments at fair value", order: 20, match: { subtypes: ["investments", "unrealized_gain"], types: [] } },
  { statement: "balance_sheet", section: "assets", key: "receivables", label: "Receivables", order: 30, match: { subtypes: ["receivable"] } },
  { statement: "balance_sheet", section: "assets", key: "accrued_income", label: "Interest and dividend receivable", order: 40, match: { subtypes: ["interest", "dividend"], types: [] } },
  { statement: "balance_sheet", section: "assets", key: "other_assets", label: "Other assets", order: 90, match: { types: ["asset"] } },
  // Liabilities
  { statement: "balance_sheet", section: "liabilities", key: "payables", label: "Accounts payable", order: 110, match: { subtypes: ["payable"] } },
  { statement: "balance_sheet", section: "liabilities", key: "accrued_expenses", label: "Accrued expenses", order: 120, match: { subtypes: ["accrued_expense"] } },
  { statement: "balance_sheet", section: "liabilities", key: "management_fee_payable", label: "Management fees payable", order: 130, match: { subtypes: ["management_fee"] } },
  { statement: "balance_sheet", section: "liabilities", key: "carried_interest_payable", label: "Accrued carried interest", order: 140, match: { subtypes: ["carried_interest"] } },
  { statement: "balance_sheet", section: "liabilities", key: "tax_liabilities", label: "Withholding and tax liabilities", order: 150, match: { subtypes: ["withholding", "tax_adjustment"] } },
  { statement: "balance_sheet", section: "liabilities", key: "other_liabilities", label: "Other liabilities", order: 190, match: { types: ["liability"] } },
  // Capital
  { statement: "balance_sheet", section: "capital", key: "partner_capital", label: "Partners' capital", order: 210, match: { subtypes: ["partner_capital"] } },
  { statement: "balance_sheet", section: "capital", key: "contributions", label: "Capital contributions", order: 220, match: { subtypes: ["contribution"] } },
  { statement: "balance_sheet", section: "capital", key: "distributions", label: "Distributions", order: 230, sign: -1, match: { subtypes: ["distribution"] } },
  { statement: "balance_sheet", section: "capital", key: "other_equity", label: "Other capital", order: 290, match: { types: ["equity"] } },
  // Operations — income
  { statement: "income_statement", section: "income", key: "interest_income", label: "Interest income", order: 10, match: { subtypes: ["interest"] } },
  { statement: "income_statement", section: "income", key: "dividend_income", label: "Dividend income", order: 20, match: { subtypes: ["dividend"] } },
  { statement: "income_statement", section: "income", key: "other_income", label: "Other investment income", order: 30, match: { subtypes: ["investment_income"] } },
  // Operations — expenses
  { statement: "income_statement", section: "expenses", key: "management_fees", label: "Management fees", order: 110, match: { subtypes: ["management_fee"] } },
  { statement: "income_statement", section: "expenses", key: "organizational_expenses", label: "Organisational expenses", order: 120, match: { subtypes: ["organizational_expense"] } },
  { statement: "income_statement", section: "expenses", key: "tax_expense", label: "Taxes", order: 130, match: { subtypes: ["tax_adjustment", "withholding"] } },
  { statement: "income_statement", section: "expenses", key: "other_expenses", label: "Other operating expenses", order: 190, match: { types: ["expense"] } },
  // Operations — gains
  { statement: "income_statement", section: "gains", key: "realized_gain", label: "Net realised gain / loss", order: 210, match: { subtypes: ["realized_gain"] } },
  { statement: "income_statement", section: "gains", key: "unrealized_gain", label: "Net change in unrealised appreciation", order: 220, match: { subtypes: ["unrealized_gain"] } },
];

export const DEFAULT_MAPPING: StatementMapping = {
  version: 1,
  basis: "accrual",
  lines: DEFAULT_MAPPING_LINES,
};

export type AccountRef = {
  accountId: string;
  code: string;
  name: string;
  accountType: AccountType;
  subtype: AccountSubtype;
};

/** Most specific rule wins: explicit code, then subtype, then account type. */
export function mapAccount(
  account: AccountRef,
  mapping: StatementMapping,
  statement: MappingLine["statement"],
): MappingLine | null {
  const candidates = mapping.lines.filter((l) => l.statement === statement);
  const byCode = candidates.find((l) => (l.match.codes ?? []).includes(account.code));
  if (byCode) return byCode;
  const bySubtype = candidates.find((l) => (l.match.subtypes ?? []).includes(account.subtype));
  if (bySubtype) return bySubtype;
  const byType = candidates.find((l) => (l.match.types ?? []).includes(account.accountType));
  return byType ?? null;
}

/** Accounts a mapping cannot place — a blocking reporting exception. */
export function unmappedAccounts(
  accounts: AccountRef[],
  mapping: StatementMapping,
): AccountRef[] {
  return accounts.filter((account) => {
    const statement: MappingLine["statement"] =
      account.accountType === "income" || account.accountType === "expense"
        ? "income_statement"
        : "balance_sheet";
    return !mapAccount(account, mapping, statement);
  });
}

// ------------------------------------------------------------ balances

export type AccountBalance = AccountRef & {
  openingDebitCents?: number;
  openingCreditCents?: number;
  debitCents: number;
  creditCents: number;
};

/** A positive number always means "more of what this account normally holds". */
export function signedBalanceCents(
  accountType: AccountType,
  debitCents: number,
  creditCents: number,
) {
  const debitNormal = accountType === "asset" || accountType === "expense";
  return debitNormal ? debitCents - creditCents : creditCents - debitCents;
}

// ------------------------------------------------------- trial balance

export type TrialBalanceRow = {
  accountId: string;
  code: string;
  name: string;
  accountType: AccountType;
  openingCents: number;
  debitCents: number;
  creditCents: number;
  endingCents: number;
};

export type TrialBalance = {
  asOf: string;
  rows: TrialBalanceRow[];
  totalDebitCents: number;
  totalCreditCents: number;
  differenceCents: number;
  balanced: boolean;
};

export function trialBalance(asOf: string, balances: AccountBalance[]): TrialBalance {
  const rows: TrialBalanceRow[] = balances
    .map((b) => {
      const openingDebit = b.openingDebitCents ?? 0;
      const openingCredit = b.openingCreditCents ?? 0;
      const opening = signedBalanceCents(b.accountType, openingDebit, openingCredit);
      const ending = signedBalanceCents(
        b.accountType,
        openingDebit + b.debitCents,
        openingCredit + b.creditCents,
      );
      return {
        accountId: b.accountId,
        code: b.code,
        name: b.name,
        accountType: b.accountType,
        openingCents: opening,
        debitCents: b.debitCents,
        creditCents: b.creditCents,
        endingCents: ending,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  const totalDebitCents = balances.reduce((t, b) => t + (b.openingDebitCents ?? 0) + b.debitCents, 0);
  const totalCreditCents = balances.reduce(
    (t, b) => t + (b.openingCreditCents ?? 0) + b.creditCents,
    0,
  );
  const differenceCents = totalDebitCents - totalCreditCents;
  return {
    asOf,
    rows,
    totalDebitCents,
    totalCreditCents,
    differenceCents,
    balanced: differenceCents === 0,
  };
}

// ---------------------------------------------------------- statements

export type StatementLine = {
  statement: StatementKind;
  section: string;
  key: string;
  label: string;
  order: number;
  amountCents: number;
  comparativeCents?: number | null;
  isTotal?: boolean;
  accountCodes: string[];
  provenance: { accountIds: string[]; mappingVersion: number };
};

function accumulate(
  balances: AccountBalance[],
  mapping: StatementMapping,
  statement: MappingLine["statement"],
  cumulative: boolean,
): StatementLine[] {
  const byKey = new Map<string, StatementLine>();
  for (const balance of balances) {
    const line = mapAccount(balance, mapping, statement);
    if (!line) continue;
    const debit = (cumulative ? balance.openingDebitCents ?? 0 : 0) + balance.debitCents;
    const credit = (cumulative ? balance.openingCreditCents ?? 0 : 0) + balance.creditCents;
    const amount = signedBalanceCents(balance.accountType, debit, credit) * (line.sign ?? 1);
    const existing =
      byKey.get(line.key) ??
      ({
        statement,
        section: line.section,
        key: line.key,
        label: line.label,
        order: line.order,
        amountCents: 0,
        accountCodes: [],
        provenance: { accountIds: [], mappingVersion: mapping.version },
      } satisfies StatementLine);
    existing.amountCents += amount;
    existing.accountCodes.push(balance.code);
    existing.provenance.accountIds.push(balance.accountId);
    byKey.set(line.key, existing);
  }
  return [...byKey.values()].sort((a, b) => a.order - b.order);
}

export type BalanceSheet = {
  asOf: string;
  basis: ReportingBasis;
  mappingVersion: number;
  lines: StatementLine[];
  totalAssetsCents: number;
  totalLiabilitiesCents: number;
  netAssetsCents: number;
  balances: boolean;
};

/** Balance sheet from cumulative (inception-to-date) ledger balances. */
export function balanceSheet(
  asOf: string,
  balances: AccountBalance[],
  mapping: StatementMapping,
  operationsNetCents = 0,
): BalanceSheet {
  const lines = accumulate(balances, mapping, "balance_sheet", true);
  const sum = (section: string) =>
    lines.filter((l) => l.section === section).reduce((t, l) => t + l.amountCents, 0);
  const totalAssetsCents = sum("assets");
  const totalLiabilitiesCents = sum("liabilities");
  const capitalFromLedgerCents = sum("capital") + operationsNetCents;
  const netAssetsCents = totalAssetsCents - totalLiabilitiesCents;
  return {
    asOf,
    basis: mapping.basis,
    mappingVersion: mapping.version,
    lines,
    totalAssetsCents,
    totalLiabilitiesCents,
    netAssetsCents,
    balances: netAssetsCents === capitalFromLedgerCents,
  };
}

export type IncomeStatement = {
  periodStart: string;
  periodEnd: string;
  basis: ReportingBasis;
  mappingVersion: number;
  lines: StatementLine[];
  totalIncomeCents: number;
  totalExpensesCents: number;
  netInvestmentIncomeCents: number;
  realizedCents: number;
  unrealizedCents: number;
  netIncreaseCents: number;
};

/** Operations from period activity only — never cumulative balances. */
export function incomeStatement(
  periodStart: string,
  periodEnd: string,
  periodBalances: AccountBalance[],
  mapping: StatementMapping,
): IncomeStatement {
  const lines = accumulate(periodBalances, mapping, "income_statement", false);
  const sum = (section: string) =>
    lines.filter((l) => l.section === section).reduce((t, l) => t + l.amountCents, 0);
  const totalIncomeCents = sum("income");
  const totalExpensesCents = sum("expenses");
  const gainLines = lines.filter((l) => l.section === "gains");
  const realizedCents = gainLines.find((l) => l.key === "realized_gain")?.amountCents ?? 0;
  const unrealizedCents = gainLines.find((l) => l.key === "unrealized_gain")?.amountCents ?? 0;
  const netInvestmentIncomeCents = totalIncomeCents - totalExpensesCents;
  return {
    periodStart,
    periodEnd,
    basis: mapping.basis,
    mappingVersion: mapping.version,
    lines,
    totalIncomeCents,
    totalExpensesCents,
    netInvestmentIncomeCents,
    realizedCents,
    unrealizedCents,
    netIncreaseCents: netInvestmentIncomeCents + realizedCents + unrealizedCents,
  };
}

export type CapitalRollforward = {
  beginningCents: number;
  contributionsCents: number;
  distributionsCents: number;
  netOperationsCents: number;
  otherActivityCents: number;
  endingCents: number;
};

export function changesInCapital(input: Omit<CapitalRollforward, "endingCents">): CapitalRollforward {
  return {
    ...input,
    endingCents:
      input.beginningCents +
      input.contributionsCents -
      input.distributionsCents +
      input.netOperationsCents +
      input.otherActivityCents,
  };
}

// ------------------------------------------------------------- cash flow

export const CASH_FLOW_SECTIONS = ["operating", "investing", "financing"] as const;
export type CashFlowSection = (typeof CASH_FLOW_SECTIONS)[number];

export type CashMovement = {
  entryId: string;
  entryDate: string;
  amountCents: number; // positive = cash in
  counterSubtype: AccountSubtype;
  memo?: string | null;
};

/** Classification is by the account the cash moved against, never by balances. */
export function classifyCashFlow(subtype: AccountSubtype): CashFlowSection {
  if (subtype === "investments" || subtype === "realized_gain" || subtype === "unrealized_gain") {
    return "investing";
  }
  if (
    subtype === "contribution" ||
    subtype === "distribution" ||
    subtype === "partner_capital" ||
    subtype === "carried_interest"
  ) {
    return "financing";
  }
  return "operating";
}

export type CashFlowStatement = {
  periodStart: string;
  periodEnd: string;
  sections: { section: CashFlowSection; amountCents: number; movements: CashMovement[] }[];
  netChangeCents: number;
  openingCashCents: number;
  closingCashCents: number;
  reconciles: boolean;
};

export function cashFlowStatement(
  periodStart: string,
  periodEnd: string,
  movements: CashMovement[],
  openingCashCents: number,
  closingCashCents: number,
): CashFlowStatement {
  const sections = CASH_FLOW_SECTIONS.map((section) => {
    const mine = movements.filter((m) => classifyCashFlow(m.counterSubtype) === section);
    return {
      section,
      amountCents: mine.reduce((t, m) => t + m.amountCents, 0),
      movements: mine,
    };
  });
  const netChangeCents = sections.reduce((t, s) => t + s.amountCents, 0);
  return {
    periodStart,
    periodEnd,
    sections,
    netChangeCents,
    openingCashCents,
    closingCashCents,
    reconciles: openingCashCents + netChangeCents === closingCashCents,
  };
}

// ------------------------------------------------- schedule of investments

export type ScheduleHolding = {
  assetId: string;
  issuer: string;
  instrument: string | null;
  assetClass: string;
  industry?: string | null;
  geography?: string | null;
  acquisitionDate: string | null;
  quantity: number | null;
  ownershipPct: number | null;
  costBasisCents: number;
  fairValueCents: number;
  valuationId: string | null;
  valuationVersion: number | null;
  valuationDate: string | null;
  methodology: string | null;
};

export type ScheduleRow = ScheduleHolding & {
  unrealizedGainCents: number;
  pctOfNav: number | null;
};

export type ScheduleOfInvestments = {
  asOf: string;
  rows: ScheduleRow[];
  totalCostCents: number;
  totalFairValueCents: number;
  totalUnrealizedCents: number;
};

/** A schedule never shows a mark that was made effective after the report date. */
export function scheduleOfInvestments(
  asOf: string,
  holdings: ScheduleHolding[],
  netAssetsCents: number | null,
): ScheduleOfInvestments {
  for (const h of holdings) {
    if (h.valuationDate && h.valuationDate > asOf) {
      throw new Error(
        `Valuation for ${h.issuer} is effective ${h.valuationDate}, after the ${asOf} reporting date.`,
      );
    }
  }
  const rows: ScheduleRow[] = holdings
    .map((h) => ({
      ...h,
      unrealizedGainCents: h.fairValueCents - h.costBasisCents,
      pctOfNav:
        netAssetsCents && netAssetsCents !== 0
          ? Number(((h.fairValueCents / netAssetsCents) * 100).toFixed(4))
          : null,
    }))
    .sort((a, b) => b.fairValueCents - a.fairValueCents);
  return {
    asOf,
    rows,
    totalCostCents: rows.reduce((t, r) => t + r.costBasisCents, 0),
    totalFairValueCents: rows.reduce((t, r) => t + r.fairValueCents, 0),
    totalUnrealizedCents: rows.reduce((t, r) => t + r.unrealizedGainCents, 0),
  };
}

// ------------------------------------------------------------ exceptions

export const REPORT_EXCEPTION_KINDS = [
  "trial_balance_unbalanced",
  "balance_sheet_unbalanced",
  "nav_mismatch",
  "capital_mismatch",
  "cash_flow_mismatch",
  "unmapped_accounts",
  "period_not_closed",
  "allocations_not_finalized",
  "nav_not_approved",
  "close_item_outstanding",
  "mapping_version_mismatch",
] as const;
export type ReportExceptionKind = (typeof REPORT_EXCEPTION_KINDS)[number];

export type ReportException = {
  kind: ReportExceptionKind;
  severity: "blocking" | "warning";
  detail: string;
  context?: Record<string, unknown>;
};

export type ReconciliationInput = {
  basis: ReportingBasis;
  trialBalance: TrialBalance;
  balanceSheet: BalanceSheet;
  capital: CapitalRollforward;
  navNetAssetsCents: number | null;
  navStatus: string | null;
  investorCapitalTotalCents: number | null;
  allocationStatus: string | null;
  periodStatus: string | null;
  unmapped: AccountRef[];
  cashFlow?: CashFlowStatement | null;
  toleranceCents?: number;
};

/** Every reason a statement set may not be published, in one place. */
export function reportingExceptions(input: ReconciliationInput): ReportException[] {
  const tolerance = input.toleranceCents ?? 0;
  const out: ReportException[] = [];
  const off = (a: number, b: number) => Math.abs(a - b) > tolerance;

  if (!input.trialBalance.balanced) {
    out.push({
      kind: "trial_balance_unbalanced",
      severity: "blocking",
      detail: `Trial balance is out by ${input.trialBalance.differenceCents} cents.`,
      context: { differenceCents: input.trialBalance.differenceCents },
    });
  }
  if (!input.balanceSheet.balances) {
    out.push({
      kind: "balance_sheet_unbalanced",
      severity: "blocking",
      detail: "Assets less liabilities do not equal capital plus net operations.",
    });
  }
  if (input.unmapped.length > 0) {
    out.push({
      kind: "unmapped_accounts",
      severity: "blocking",
      detail: `${input.unmapped.length} account(s) are not mapped to a statement line.`,
      context: { codes: input.unmapped.map((a) => a.code) },
    });
  }
  if (navTieRequired(input.basis)) {
    if (input.navNetAssetsCents === null) {
      out.push({
        kind: "nav_not_approved",
        severity: "blocking",
        detail: "No approved NAV exists for this reporting date.",
      });
    } else if (off(input.balanceSheet.netAssetsCents, input.navNetAssetsCents)) {
      out.push({
        kind: "nav_mismatch",
        severity: "blocking",
        detail: `Net assets ${input.balanceSheet.netAssetsCents} do not match approved NAV ${input.navNetAssetsCents}.`,
        context: {
          differenceCents: input.balanceSheet.netAssetsCents - input.navNetAssetsCents,
        },
      });
    }
  }
  if (input.investorCapitalTotalCents === null) {
    out.push({
      kind: "allocations_not_finalized",
      severity: "blocking",
      detail: "Investor allocations for this period are not finalized.",
    });
  } else if (off(input.capital.endingCents, input.investorCapitalTotalCents)) {
    out.push({
      kind: "capital_mismatch",
      severity: "blocking",
      detail: `Ending capital ${input.capital.endingCents} does not match investor capital accounts ${input.investorCapitalTotalCents}.`,
      context: {
        differenceCents: input.capital.endingCents - input.investorCapitalTotalCents,
      },
    });
  }
  if (input.cashFlow && !input.cashFlow.reconciles) {
    out.push({
      kind: "cash_flow_mismatch",
      severity: "blocking",
      detail: "Cash movements do not explain the change in the cash balance.",
    });
  }
  if (input.periodStatus && !["closed", "locked"].includes(input.periodStatus)) {
    out.push({
      kind: "period_not_closed",
      severity: "warning",
      detail: `The accounting period is ${input.periodStatus}.`,
    });
  }
  return out;
}

export function blockingExceptions(exceptions: ReportException[]) {
  return exceptions.filter((e) => e.severity === "blocking");
}

// ------------------------------------------------------- report lifecycle

export const FINANCIAL_REPORT_FLOW = [
  "draft",
  "prepared",
  "review",
  "approved",
  "published",
  "superseded",
] as const;
export type FinancialReportStatus = (typeof FINANCIAL_REPORT_FLOW)[number];

const TRANSITIONS: Record<FinancialReportStatus, FinancialReportStatus[]> = {
  draft: ["prepared"],
  prepared: ["review", "draft"],
  review: ["approved", "prepared"],
  approved: ["published", "review"],
  published: ["superseded"],
  superseded: [],
};

export function canTransitionFinancialReport(
  from: FinancialReportStatus,
  to: FinancialReportStatus,
) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function isImmutableReport(status: FinancialReportStatus) {
  return status === "published" || status === "superseded";
}

export type ReportActors = {
  preparedBy: string | null;
  reviewedBy: string | null;
  approvedBy: string | null;
  publishedBy: string | null;
};

/** Preparer ≠ approver, and no automated actor ever satisfies a human step. */
export function segregationError(
  actors: ReportActors,
  step: "review" | "approve" | "publish",
  actorId: string,
): string | null {
  if (!actorId || actorId === "service_role" || actorId.startsWith("service:")) {
    return "An automated actor cannot satisfy a human approval step.";
  }
  if (step === "review" && actors.preparedBy === actorId) {
    return "A report must be reviewed by someone other than its preparer.";
  }
  if (step === "approve" && actors.preparedBy === actorId) {
    return "A report must be approved by someone other than its preparer.";
  }
  if (step === "publish" && actors.approvedBy === actorId && actors.reviewedBy === actorId) {
    return "Publication needs a different person from the one who reviewed and approved.";
  }
  return null;
}

/** Provenance every published financial report must carry to be reproducible. */
export const REQUIRED_STATEMENT_PROVENANCE = [
  "offering_id",
  "report_type",
  "period_end",
  "basis",
  "book_id",
  "period_id",
  "gl_cutoff_at",
  "mapping_version",
  "nav_version_id",
  "valuation_versions",
  "generated_by",
  "prepared_by",
  "reviewed_by",
  "approved_by",
  "published_by",
  "published_at",
] as const;

export function missingStatementProvenance(report: Record<string, unknown>) {
  return REQUIRED_STATEMENT_PROVENANCE.filter((field) => {
    const value = report[field];
    if (Array.isArray(value)) return value.length === 0;
    return value === null || value === undefined || value === "";
  });
}

// ----------------------------------------------------------- comparatives

export const COMPARATIVE_MODES = ["prior_period", "year_to_date", "inception_to_date"] as const;
export type ComparativeMode = (typeof COMPARATIVE_MODES)[number];

/**
 * Figures may only be compared when both versions used the same statement
 * mapping; otherwise the two columns mean different things.
 */
export function comparableMapping(current: number, prior: number | null | undefined) {
  return prior === null || prior === undefined ? false : current === prior;
}

export function yearStart(periodEnd: string) {
  return `${periodEnd.slice(0, 4)}-01-01`;
}

export function priorPeriodBounds(periodStart: string, periodEnd: string) {
  const start = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(`${periodEnd}T00:00:00Z`);
  const lengthMs = end.getTime() - start.getTime();
  const priorEnd = new Date(start.getTime() - 86_400_000);
  const priorStart = new Date(priorEnd.getTime() - lengthMs);
  return {
    start: priorStart.toISOString().slice(0, 10),
    end: priorEnd.toISOString().slice(0, 10),
  };
}

// ------------------------------------------------------------- packages

export type PackageItem = { reportType: string; label: string };

export const PACKAGE_TEMPLATES: Record<
  "quarterly_lp" | "internal_accounting" | "audit",
  { name: string; audience: "investor" | "harmonious" | "manager"; items: PackageItem[] }
> = {
  quarterly_lp: {
    name: "Quarterly LP package",
    audience: "investor",
    items: [
      { reportType: "balance_sheet", label: "Statement of assets and liabilities" },
      { reportType: "income_statement", label: "Statement of operations" },
      { reportType: "changes_in_capital", label: "Changes in partners' capital" },
      { reportType: "schedule_of_investments", label: "Schedule of investments" },
      { reportType: "capital_account_statement", label: "Capital account statements" },
      { reportType: "performance", label: "NAV summary" },
    ],
  },
  internal_accounting: {
    name: "Internal accounting package",
    audience: "harmonious",
    items: [
      { reportType: "trial_balance", label: "Trial balance" },
      { reportType: "general_ledger", label: "General ledger detail" },
      { reportType: "cash_activity", label: "Bank reconciliation" },
      { reportType: "expense_report", label: "Expense detail" },
      { reportType: "valuation_report", label: "Valuation report" },
      { reportType: "capital_account_statement", label: "Capital reconciliation" },
    ],
  },
  audit: {
    name: "Audit package",
    audience: "harmonious",
    items: [
      { reportType: "trial_balance", label: "Trial balance" },
      { reportType: "general_ledger", label: "General ledger" },
      { reportType: "audit_support", label: "Journal register" },
      { reportType: "cash_activity", label: "Reconciliation support" },
      { reportType: "valuation_report", label: "Valuation support" },
      { reportType: "changes_in_capital", label: "Capital roll-forward" },
      { reportType: "schedule_of_investments", label: "Schedule of investments" },
    ],
  },
};

/** The version manifest an audit package must carry. */
export function packageManifest(reports: {
  reportType: string;
  version: number;
  reportId: string;
  mappingVersion: number | null;
  navVersionId: string | null;
  glCutoffAt: string | null;
}[]) {
  return {
    generatedAt: new Date().toISOString(),
    reports: reports.map((r) => ({ ...r })),
  };
}

// ------------------------------------------------------------ workpapers

export const WORKPAPER_KINDS = [
  "cash_reconciliation",
  "investment_rollforward",
  "valuation_support",
  "receivable_payable_support",
  "management_fee_calculation",
  "expense_accruals",
  "investor_capital_reconciliation",
  "contributions_distributions",
  "nav_tie_out",
] as const;
export type WorkpaperKind = (typeof WORKPAPER_KINDS)[number];

export const WORKPAPER_LABELS: Record<WorkpaperKind, string> = {
  cash_reconciliation: "Cash reconciliation",
  investment_rollforward: "Investment roll-forward",
  valuation_support: "Valuation support",
  receivable_payable_support: "Receivable and payable support",
  management_fee_calculation: "Management fee calculation",
  expense_accruals: "Expense accruals",
  investor_capital_reconciliation: "Investor capital reconciliation",
  contributions_distributions: "Contributions and distributions",
  nav_tie_out: "NAV tie-out",
};

export const WORKPAPER_STATUSES = ["draft", "prepared", "review", "approved"] as const;
export type WorkpaperStatus = (typeof WORKPAPER_STATUSES)[number];

const WORKPAPER_TRANSITIONS: Record<WorkpaperStatus, WorkpaperStatus[]> = {
  draft: ["prepared"],
  prepared: ["review", "draft"],
  review: ["approved", "prepared"],
  approved: [],
};

export function canTransitionWorkpaper(from: WorkpaperStatus, to: WorkpaperStatus) {
  return (WORKPAPER_TRANSITIONS[from] ?? []).includes(to);
}

export function workpaperSignoffError(
  paper: { preparedBy: string | null; status: WorkpaperStatus },
  actorId: string,
  to: WorkpaperStatus,
) {
  if (to === "approved" && paper.preparedBy === actorId) {
    return "A workpaper must be signed off by someone other than its preparer.";
  }
  return null;
}

// ------------------------------------------------------ close checklist

export const CLOSE_CHECKLIST: { key: string; label: string; blocking: boolean }[] = [
  { key: "cash_reconciled", label: "Cash reconciled to the bank", blocking: true },
  { key: "journals_posted", label: "All material journals posted", blocking: true },
  { key: "expenses_accrued", label: "Expenses accrued", blocking: true },
  { key: "fees_calculated", label: "Management fees calculated", blocking: true },
  { key: "valuations_approved", label: "Valuations approved", blocking: true },
  { key: "nav_approved", label: "NAV approved", blocking: true },
  { key: "allocations_finalized", label: "Investor allocations finalized", blocking: true },
  { key: "capital_reconciled", label: "Capital accounts reconciled", blocking: true },
  { key: "trial_balance_balanced", label: "Trial balance balanced", blocking: true },
  { key: "statements_reconciled", label: "Statements reconciled", blocking: true },
  { key: "review_notes_resolved", label: "Review notes resolved", blocking: false },
];

export type ChecklistItem = {
  item_key: string;
  label?: string;
  blocking: boolean;
  status: "pending" | "complete" | "waived";
};

/** Publication respects the configured blocking items, and only those. */
export function closeBlockers(items: ChecklistItem[]) {
  return items.filter((i) => i.blocking && i.status === "pending").map((i) => i.item_key);
}

export function publicationBlockers(input: {
  status: FinancialReportStatus;
  exceptions: ReportException[];
  checklist: ChecklistItem[];
}) {
  const reasons: string[] = [];
  if (input.status !== "approved") reasons.push("Only an approved report can be published.");
  for (const exception of blockingExceptions(input.exceptions)) reasons.push(exception.detail);
  for (const key of closeBlockers(input.checklist)) {
    reasons.push(`Close item outstanding: ${key}.`);
  }
  return reasons;
}

// ------------------------------------------------------------ visibility

export type ReportAudience = "harmonious" | "manager" | "investor";

/** Who may see a report, decided from its state and flags, never from the URL. */
export function mayViewReport(
  report: {
    status: FinancialReportStatus;
    statement: StatementKind;
    managerVisible: boolean;
    investorVisible: boolean;
    subjectUserId?: string | null;
  },
  viewer: { audience: ReportAudience; userId?: string; managesFund: boolean; holdsPosition: boolean },
) {
  if (viewer.audience === "harmonious") return true;
  const published = report.status === "published" || report.status === "superseded";
  if (viewer.audience === "manager") {
    return published && report.managerVisible && viewer.managesFund;
  }
  if (!published || report.status === "superseded") return false;
  if (!report.investorVisible || !investorMaySee(report.statement)) return false;
  if (report.subjectUserId) return report.subjectUserId === viewer.userId;
  return viewer.holdsPosition;
}
