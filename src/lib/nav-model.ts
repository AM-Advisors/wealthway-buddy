/**
 * Canonical NAV vocabulary and arithmetic.
 *
 * NAV is never a typed-in number. It is derived from posted ledger balances and
 * approved, as-of portfolio valuations, and every published NAV carries the
 * snapshot that reproduces it. Everything in this module is pure so the rules
 * can be tested without a database.
 */

import type { AccountSubtype, AccountType } from "@/lib/accounting-model";

// ------------------------------------------------------------- frequencies

export const NAV_FREQUENCIES = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "annually",
  "custom",
] as const;
export type NavFrequency = (typeof NAV_FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<NavFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
  custom: "Ad hoc",
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The period a NAV as-of date belongs to, for the fund's NAV frequency. */
export function periodBoundsFor(
  frequency: NavFrequency,
  asOfDate: string,
): { start: string; end: string; label: string } {
  const end = new Date(`${asOfDate}T00:00:00Z`);
  const y = end.getUTCFullYear();
  const m = end.getUTCMonth();
  const d = end.getUTCDate();

  switch (frequency) {
    case "daily":
      return { start: asOfDate, end: asOfDate, label: asOfDate };
    case "weekly": {
      const start = new Date(Date.UTC(y, m, d - 6));
      return { start: iso(start), end: asOfDate, label: `Week to ${asOfDate}` };
    }
    case "monthly": {
      const start = new Date(Date.UTC(y, m, 1));
      return { start: iso(start), end: asOfDate, label: `${y}-${String(m + 1).padStart(2, "0")}` };
    }
    case "quarterly": {
      const q = Math.floor(m / 3);
      const start = new Date(Date.UTC(y, q * 3, 1));
      return { start: iso(start), end: asOfDate, label: `${y} Q${q + 1}` };
    }
    case "annually": {
      const start = new Date(Date.UTC(y, 0, 1));
      return { start: iso(start), end: asOfDate, label: `FY ${y}` };
    }
    case "custom":
      return { start: asOfDate, end: asOfDate, label: `As at ${asOfDate}` };
  }
}

// ---------------------------------------------------------------- lifecycle

export const NAV_STATUSES = [
  "draft",
  "calculating",
  "review",
  "approved",
  "published",
  "superseded",
] as const;
export type NavStatus = (typeof NAV_STATUSES)[number];

const NAV_TRANSITIONS: Record<NavStatus, NavStatus[]> = {
  draft: ["calculating", "review"],
  calculating: ["draft", "review"],
  review: ["approved", "draft"],
  approved: ["published", "review"],
  published: ["superseded"],
  superseded: [],
};

export function canTransitionNav(from: NavStatus, to: NavStatus) {
  return NAV_TRANSITIONS[from].includes(to);
}

export function isPublishedNav(status: NavStatus) {
  return status === "published" || status === "superseded";
}

// ------------------------------------------------------------ segregation

export type NavPeople = {
  preparedBy?: string | null;
  reviewedBy?: string | null;
  approvedBy?: string | null;
  publishedBy?: string | null;
};

/**
 * Maker / checker. The preparer never approves their own NAV, and the person
 * who reviewed it never publishes it. A service role is not a person and can
 * never stand in for either.
 */
export function segregationError(
  people: NavPeople,
  actorUserId: string | null,
  action: "review" | "approve" | "publish",
): string | null {
  if (!actorUserId) return "A human approver is required; automated processes cannot approve NAV.";
  if (action === "review" && people.preparedBy === actorUserId) {
    return "NAV must be reviewed by someone other than the person who prepared it.";
  }
  if (action === "approve" && people.preparedBy === actorUserId) {
    return "NAV must be approved by someone other than the person who prepared it.";
  }
  if (action === "approve" && !people.reviewedBy) {
    return "NAV must be reviewed before it can be approved.";
  }
  if (action === "publish" && people.reviewedBy && people.reviewedBy === actorUserId) {
    return "NAV must be published by someone other than the reviewer.";
  }
  return null;
}

// --------------------------------------------------------------- balances

export type LedgerBalance = {
  accountId: string;
  code: string;
  name: string;
  accountType: AccountType;
  subtype: AccountSubtype;
  debitCents: number;
  creditCents: number;
};

/** Debit-positive balance, the convention every NAV line below assumes. */
export function signedBalance(b: LedgerBalance) {
  return b.debitCents - b.creditCents;
}

function sumWhere(
  balances: LedgerBalance[],
  type: AccountType,
  subtypes: AccountSubtype[],
  sign: 1 | -1,
) {
  return balances
    .filter((b) => b.accountType === type && subtypes.includes(b.subtype))
    .reduce((total, b) => total + sign * signedBalance(b), 0);
}

export type NavPackage = {
  cashCents: number;
  investmentsAtCostCents: number;
  investmentsCarryingCents: number;
  investmentsFairValueCents: number;
  receivablesCents: number;
  accruedIncomeCents: number;
  otherAssetsCents: number;
  grossAssetsCents: number;
  payablesCents: number;
  accruedExpensesCents: number;
  managementFeeCents: number;
  taxLiabilitiesCents: number;
  otherLiabilitiesCents: number;
  totalLiabilitiesCents: number;
  netAssetValueCents: number;
  navPerUnitCents: number | null;
  unitsOutstanding: number | null;
};

const ASSET_OTHER: AccountSubtype[] = ["other", "tax_adjustment"];

export type NavPackageInput = {
  balances: LedgerBalance[];
  /** Total of approved valuations effective as of the NAV date. */
  investmentsFairValueCents?: number | null;
  unitAccounting?: boolean;
  unitsOutstanding?: number | null;
};

/** Cash + investments + other assets + receivables − liabilities − accruals. */
export function navPackage(input: NavPackageInput): NavPackage {
  const b = input.balances;
  const cashCents = sumWhere(b, "asset", ["cash"], 1);
  const investmentsAtCostCents = sumWhere(b, "asset", ["investments"], 1);
  const appreciationCents = sumWhere(b, "asset", ["unrealized_gain", "realized_gain"], 1);
  const investmentsCarryingCents = investmentsAtCostCents + appreciationCents;
  const receivablesCents = sumWhere(b, "asset", ["receivable"], 1);
  const accruedIncomeCents = sumWhere(
    b,
    "asset",
    ["investment_income", "interest", "dividend"],
    1,
  );
  const otherAssetsCents = sumWhere(b, "asset", ASSET_OTHER, 1);

  const investmentsFairValueCents =
    input.investmentsFairValueCents === null || input.investmentsFairValueCents === undefined
      ? investmentsCarryingCents
      : input.investmentsFairValueCents;

  const grossAssetsCents =
    cashCents +
    investmentsFairValueCents +
    receivablesCents +
    accruedIncomeCents +
    otherAssetsCents;

  const payablesCents = sumWhere(b, "liability", ["payable"], -1);
  const accruedExpensesCents = sumWhere(b, "liability", ["accrued_expense"], -1);
  const managementFeeCents = sumWhere(b, "liability", ["management_fee"], -1);
  const taxLiabilitiesCents = sumWhere(b, "liability", ["withholding", "tax_adjustment"], -1);
  const otherLiabilitiesCents = sumWhere(b, "liability", ["carried_interest", "other"], -1);
  const totalLiabilitiesCents =
    payablesCents +
    accruedExpensesCents +
    managementFeeCents +
    taxLiabilitiesCents +
    otherLiabilitiesCents;

  const netAssetValueCents = grossAssetsCents - totalLiabilitiesCents;
  const units = input.unitAccounting ? (input.unitsOutstanding ?? null) : null;

  return {
    cashCents,
    investmentsAtCostCents,
    investmentsCarryingCents,
    investmentsFairValueCents,
    receivablesCents,
    accruedIncomeCents,
    otherAssetsCents,
    grossAssetsCents,
    payablesCents,
    accruedExpensesCents,
    managementFeeCents,
    taxLiabilitiesCents,
    otherLiabilitiesCents,
    totalLiabilitiesCents,
    netAssetValueCents,
    unitsOutstanding: units,
    navPerUnitCents: navPerUnitCents(netAssetValueCents, units),
  };
}

/** Unitised funds only. Partnerships keep capital accounts, not units. */
export function navPerUnitCents(netAssetsCents: number, units: number | null | undefined) {
  if (units === null || units === undefined || units <= 0) return null;
  return Math.round(netAssetsCents / units);
}

// ---------------------------------------------------------------- activity

export type NavActivity = {
  contributionsCents: number;
  distributionsCents: number;
  investmentIncomeCents: number;
  realizedGainCents: number;
  realizedLossCents: number;
  unrealizedGainCents: number;
  unrealizedLossCents: number;
  managementFeesCents: number;
  fundExpensesCents: number;
  otherCents: number;
};

export const EMPTY_ACTIVITY: NavActivity = {
  contributionsCents: 0,
  distributionsCents: 0,
  investmentIncomeCents: 0,
  realizedGainCents: 0,
  realizedLossCents: 0,
  unrealizedGainCents: 0,
  unrealizedLossCents: 0,
  managementFeesCents: 0,
  fundExpensesCents: 0,
  otherCents: 0,
};

/** Period movement, read from postings inside the period only. */
export function activityFromBalances(periodBalances: LedgerBalance[]): NavActivity {
  const credit = (type: AccountType, subtypes: AccountSubtype[]) =>
    sumWhere(periodBalances, type, subtypes, -1);
  const debit = (type: AccountType, subtypes: AccountSubtype[]) =>
    sumWhere(periodBalances, type, subtypes, 1);

  const realized = credit("income", ["realized_gain"]);
  const unrealized = credit("income", ["unrealized_gain"]);

  return {
    contributionsCents: credit("equity", ["contribution"]),
    distributionsCents: debit("equity", ["distribution"]),
    investmentIncomeCents: credit("income", ["investment_income", "interest", "dividend"]),
    realizedGainCents: Math.max(realized, 0),
    realizedLossCents: Math.max(-realized, 0),
    unrealizedGainCents: Math.max(unrealized, 0),
    unrealizedLossCents: Math.max(-unrealized, 0),
    managementFeesCents: debit("expense", ["management_fee"]),
    fundExpensesCents: debit("expense", ["organizational_expense", "other"]),
    otherCents: debit("expense", ["tax_adjustment"]) * -1,
  };
}

// ------------------------------------------------------------------ bridge

export type BridgeLine = { key: string; label: string; amountCents: number };

export type NavBridge = {
  beginningNavCents: number;
  lines: BridgeLine[];
  computedEndingCents: number;
  endingNavCents: number;
  differenceCents: number;
  reconciles: boolean;
};

/** Beginning NAV ± period activity must land exactly on ending NAV. */
export function navBridge(
  beginningNavCents: number,
  activity: NavActivity,
  endingNavCents: number,
): NavBridge {
  const lines: BridgeLine[] = [
    { key: "contributions", label: "Contributions", amountCents: activity.contributionsCents },
    { key: "distributions", label: "Distributions", amountCents: -activity.distributionsCents },
    { key: "income", label: "Investment income", amountCents: activity.investmentIncomeCents },
    { key: "realized_gain", label: "Realised gains", amountCents: activity.realizedGainCents },
    { key: "realized_loss", label: "Realised losses", amountCents: -activity.realizedLossCents },
    { key: "unrealized_gain", label: "Unrealised gains", amountCents: activity.unrealizedGainCents },
    {
      key: "unrealized_loss",
      label: "Unrealised losses",
      amountCents: -activity.unrealizedLossCents,
    },
    { key: "management_fees", label: "Management fees", amountCents: -activity.managementFeesCents },
    { key: "fund_expenses", label: "Fund expenses", amountCents: -activity.fundExpensesCents },
    { key: "other", label: "Other", amountCents: activity.otherCents },
  ];
  const computedEndingCents =
    beginningNavCents + lines.reduce((total, l) => total + l.amountCents, 0);
  const differenceCents = endingNavCents - computedEndingCents;
  return {
    beginningNavCents,
    lines,
    computedEndingCents,
    endingNavCents,
    differenceCents,
    reconciles: differenceCents === 0,
  };
}

// ------------------------------------------------------------- pre-NAV checks

export const NAV_CHECK_CODES = [
  "ledger_imbalance",
  "bridge_unreconciled",
  "future_valuation",
  "unreconciled_cash",
  "unposted_journals",
  "open_accounting_exceptions",
  "missing_valuation",
  "stale_valuation",
  "valuation_exception",
  "missing_expense_accrual",
  "open_receivables_payables",
  "unresolved_capital_activity",
  "closed_period_conflict",
  "valuation_carrying_mismatch",
] as const;
export type NavCheckCode = (typeof NAV_CHECK_CODES)[number];

/**
 * Integrity failures. No amount of documentation makes a NAV built on an
 * unbalanced ledger, a bridge that does not reconcile, or a valuation dated
 * after the NAV date publishable.
 */
export const NON_OVERRIDABLE_CHECKS: NavCheckCode[] = [
  "ledger_imbalance",
  "bridge_unreconciled",
  "future_valuation",
];

export type CheckSeverity = "pass" | "warning" | "blocking";

export type NavCheck = {
  code: NavCheckCode;
  severity: CheckSeverity;
  detail: string;
  overridable: boolean;
  context?: Record<string, unknown>;
};

export type NavPolicy = {
  frequency: NavFrequency;
  unitAccounting: boolean;
  unreconciledCashToleranceCents: number;
  unpostedJournalToleranceCents: number;
  openItemToleranceCents: number;
  valuationStalenessDays: number;
  /** Warnings this fund treats as blocking. */
  blockingChecks: NavCheckCode[];
  managerWorkflow: ManagerWorkflow;
  managerApprovalRequired: boolean;
  methodologyVersion: string;
};

export const DEFAULT_NAV_POLICY: NavPolicy = {
  frequency: "quarterly",
  unitAccounting: false,
  unreconciledCashToleranceCents: 100_000,
  unpostedJournalToleranceCents: 100_000,
  openItemToleranceCents: 100_000,
  valuationStalenessDays: 120,
  blockingChecks: ["unreconciled_cash", "unposted_journals", "missing_valuation"],
  managerWorkflow: "acknowledge",
  managerApprovalRequired: false,
  methodologyVersion: "nav-v1",
};

export type NavCheckContext = {
  ledgerDebitCents: number;
  ledgerCreditCents: number;
  unreconciledCashCents: number;
  unpostedJournalCents: number;
  openExceptionCount: number;
  assetsMissingValuation: string[];
  staleValuations: { assetName: string; days: number }[];
  valuationExceptionCount: number;
  missingExpenseAccrual: boolean;
  openReceivablesPayablesCents: number;
  unresolvedCapitalActivityCents: number;
  periodStatus: string | null;
  futureValuations: string[];
  bridgeDifferenceCents: number;
  valuationCarryingDifferenceCents: number;
};

function severityFor(code: NavCheckCode, policy: NavPolicy, failed: boolean): CheckSeverity {
  if (!failed) return "pass";
  if (NON_OVERRIDABLE_CHECKS.includes(code)) return "blocking";
  return policy.blockingChecks.includes(code) ? "blocking" : "warning";
}

function check(
  code: NavCheckCode,
  policy: NavPolicy,
  failed: boolean,
  detail: string,
  context?: Record<string, unknown>,
): NavCheck {
  return {
    code,
    severity: severityFor(code, policy, failed),
    detail,
    overridable: !NON_OVERRIDABLE_CHECKS.includes(code),
    ...(context ? { context } : {}),
  };
}

/** Every pre-NAV control, run in one place so nothing can be skipped. */
export function navChecks(ctx: NavCheckContext, policy: NavPolicy): NavCheck[] {
  const imbalance = ctx.ledgerDebitCents - ctx.ledgerCreditCents;
  return [
    check(
      "ledger_imbalance",
      policy,
      imbalance !== 0,
      imbalance === 0
        ? "Ledger balances."
        : `Ledger is out of balance by ${imbalance} cents. NAV cannot be produced.`,
      { imbalanceCents: imbalance },
    ),
    check(
      "bridge_unreconciled",
      policy,
      ctx.bridgeDifferenceCents !== 0,
      ctx.bridgeDifferenceCents === 0
        ? "NAV bridge reconciles to ending NAV."
        : `NAV bridge leaves ${ctx.bridgeDifferenceCents} cents unexplained.`,
      { differenceCents: ctx.bridgeDifferenceCents },
    ),
    check(
      "future_valuation",
      policy,
      ctx.futureValuations.length > 0,
      ctx.futureValuations.length === 0
        ? "No valuation dated after the NAV date was used."
        : `Valuations effective after the NAV date cannot be used: ${ctx.futureValuations.join(", ")}.`,
      { assets: ctx.futureValuations },
    ),
    check(
      "unreconciled_cash",
      policy,
      Math.abs(ctx.unreconciledCashCents) > policy.unreconciledCashToleranceCents,
      `Unreconciled bank activity: ${ctx.unreconciledCashCents} cents.`,
      { amountCents: ctx.unreconciledCashCents },
    ),
    check(
      "unposted_journals",
      policy,
      Math.abs(ctx.unpostedJournalCents) > policy.unpostedJournalToleranceCents,
      `Journals prepared but not posted: ${ctx.unpostedJournalCents} cents.`,
      { amountCents: ctx.unpostedJournalCents },
    ),
    check(
      "open_accounting_exceptions",
      policy,
      ctx.openExceptionCount > 0,
      `${ctx.openExceptionCount} accounting exception(s) still open.`,
      { count: ctx.openExceptionCount },
    ),
    check(
      "missing_valuation",
      policy,
      ctx.assetsMissingValuation.length > 0,
      ctx.assetsMissingValuation.length === 0
        ? "Every holding has an effective valuation."
        : `No effective valuation as at the NAV date for: ${ctx.assetsMissingValuation.join(", ")}.`,
      { assets: ctx.assetsMissingValuation },
    ),
    check(
      "stale_valuation",
      policy,
      ctx.staleValuations.length > 0,
      ctx.staleValuations.length === 0
        ? `No valuation older than ${policy.valuationStalenessDays} days.`
        : `Stale valuations: ${ctx.staleValuations.map((s) => `${s.assetName} (${s.days}d)`).join(", ")}.`,
      { stale: ctx.staleValuations },
    ),
    check(
      "valuation_exception",
      policy,
      ctx.valuationExceptionCount > 0,
      `${ctx.valuationExceptionCount} unresolved valuation exception(s).`,
      { count: ctx.valuationExceptionCount },
    ),
    check(
      "missing_expense_accrual",
      policy,
      ctx.missingExpenseAccrual,
      ctx.missingExpenseAccrual
        ? "No expense accrual was posted in this period."
        : "Expense accruals posted.",
    ),
    check(
      "open_receivables_payables",
      policy,
      Math.abs(ctx.openReceivablesPayablesCents) > policy.openItemToleranceCents,
      `Open receivables and payables: ${ctx.openReceivablesPayablesCents} cents.`,
      { amountCents: ctx.openReceivablesPayablesCents },
    ),
    check(
      "unresolved_capital_activity",
      policy,
      Math.abs(ctx.unresolvedCapitalActivityCents) > policy.openItemToleranceCents,
      `Capital activity awaiting settlement: ${ctx.unresolvedCapitalActivityCents} cents.`,
      { amountCents: ctx.unresolvedCapitalActivityCents },
    ),
    check(
      "closed_period_conflict",
      policy,
      ctx.periodStatus === "open" || ctx.periodStatus === null,
      ctx.periodStatus
        ? `Accounting period is ${ctx.periodStatus}.`
        : "No accounting period covers this NAV date.",
      { periodStatus: ctx.periodStatus },
    ),
    check(
      "valuation_carrying_mismatch",
      policy,
      ctx.valuationCarryingDifferenceCents !== 0,
      ctx.valuationCarryingDifferenceCents === 0
        ? "Approved valuations agree with ledger carrying value."
        : `Approved valuations differ from ledger carrying value by ${ctx.valuationCarryingDifferenceCents} cents; a valuation journal is outstanding.`,
      { differenceCents: ctx.valuationCarryingDifferenceCents },
    ),
  ];
}

export function blockingChecks(checks: NavCheck[]) {
  return checks.filter((c) => c.severity === "blocking");
}

export function canSubmitForReview(checks: NavCheck[]) {
  return blockingChecks(checks).length === 0;
}

export type NavOverride = { code: NavCheckCode; reason: string; by: string; at: string };

/** An override is only an override when someone actually explains it. */
export const MIN_OVERRIDE_REASON_LENGTH = 20;

/** Publication is allowed only when every blocker is either gone or documented. */
export function publicationBlockers(checks: NavCheck[], overrides: NavOverride[]) {
  const documented = new Set(
    overrides
      .filter((o) => o.reason.trim().length >= MIN_OVERRIDE_REASON_LENGTH)
      .map((o) => o.code),
  );
  return blockingChecks(checks).filter(
    (c) => !c.overridable || !documented.has(c.code),
  );
}

export function canPublish(checks: NavCheck[], overrides: NavOverride[]) {
  return publicationBlockers(checks, overrides).length === 0;
}

export function canOverride(code: NavCheckCode) {
  return !NON_OVERRIDABLE_CHECKS.includes(code);
}

// ------------------------------------------------------------ manager rights

export const MANAGER_WORKFLOWS = ["view", "acknowledge", "challenge", "approve"] as const;
export type ManagerWorkflow = (typeof MANAGER_WORKFLOWS)[number];

export type NavManagerAction = "view" | "acknowledge" | "challenge" | "approve" | "publish";

/**
 * A fund manager never edits NAV figures. A challenge sends NAV back to review;
 * Harmonious remains the only publisher.
 */
export function managerMayNav(action: NavManagerAction, workflow: ManagerWorkflow): boolean {
  switch (action) {
    case "view":
      return true;
    case "acknowledge":
      return workflow !== "view";
    case "challenge":
      return workflow === "challenge" || workflow === "approve";
    case "approve":
      return workflow === "approve";
    case "publish":
      return false;
  }
}

// ---------------------------------------------------------------- revisions

export function revisionImpact(priorNavCents: number, revisedNavCents: number) {
  const impactCents = revisedNavCents - priorNavCents;
  const impactPct = priorNavCents === 0 ? null : (impactCents / Math.abs(priorNavCents)) * 100;
  return { impactCents, impactPct };
}

export function navChange(priorNavCents: number, navCents: number) {
  const changeCents = navCents - priorNavCents;
  const changePct = priorNavCents === 0 ? null : (changeCents / Math.abs(priorNavCents)) * 100;
  return { changeCents, changePct };
}

// ----------------------------------------------------------- capital handoff

export type CapitalHandoff = {
  periodStart: string;
  periodEnd: string;
  netIncomeCents: number;
  realizedGainCents: number;
  unrealizedGainCents: number;
  managementFeesCents: number;
  fundExpensesCents: number;
  contributionsCents: number;
  distributionsCents: number;
  endingNetAssetsCents: number;
};

/** The only NAV output Step 4's allocation engine is allowed to consume. */
export function capitalHandoff(
  period: { start: string; end: string },
  activity: NavActivity,
  pkg: NavPackage,
): CapitalHandoff {
  const realized = activity.realizedGainCents - activity.realizedLossCents;
  const unrealized = activity.unrealizedGainCents - activity.unrealizedLossCents;
  return {
    periodStart: period.start,
    periodEnd: period.end,
    netIncomeCents:
      activity.investmentIncomeCents +
      realized +
      unrealized -
      activity.managementFeesCents -
      activity.fundExpensesCents,
    realizedGainCents: realized,
    unrealizedGainCents: unrealized,
    managementFeesCents: activity.managementFeesCents,
    fundExpensesCents: activity.fundExpensesCents,
    contributionsCents: activity.contributionsCents,
    distributionsCents: activity.distributionsCents,
    endingNetAssetsCents: pkg.netAssetValueCents,
  };
}
