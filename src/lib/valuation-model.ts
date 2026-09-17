/**
 * Canonical portfolio valuation vocabulary and arithmetic.
 *
 * NAV, financial statements, capital accounts and performance will all read
 * their asset values from this layer, so every rule about what a valuation is,
 * when it becomes effective, what makes it stale or suspicious, and how it
 * touches the ledger lives here as a pure function — testable without a
 * database and without any authority of its own.
 */

// ------------------------------------------------------------------- assets

export const PORTFOLIO_ASSET_CLASSES = [
  "private_common",
  "private_preferred",
  "safe",
  "convertible_note",
  "debt",
  "fund_interest",
  "spv_interest",
  "real_estate",
  "digital_security",
  "cash_equivalent",
  "other",
] as const;
export type PortfolioAssetClass = (typeof PORTFOLIO_ASSET_CLASSES)[number];

export const ASSET_CLASS_LABELS: Record<PortfolioAssetClass, string> = {
  private_common: "Private company common stock",
  private_preferred: "Preferred stock",
  safe: "SAFE",
  convertible_note: "Convertible note",
  debt: "Debt",
  fund_interest: "Fund interest",
  spv_interest: "SPV / SPE interest",
  real_estate: "Real estate",
  digital_security: "Token / digital security",
  cash_equivalent: "Cash equivalent",
  other: "Other asset",
};

export const PORTFOLIO_ASSET_STATUSES = [
  "active",
  "partially_realized",
  "realized",
  "written_off",
] as const;
export type PortfolioAssetStatus = (typeof PORTFOLIO_ASSET_STATUSES)[number];

// ------------------------------------------------------------ methodologies

export const VALUATION_METHODS = [
  "recent_financing",
  "transaction_price",
  "secondary_transaction",
  "market_comparable",
  "public_market",
  "dcf",
  "income_approach",
  "cost",
  "adjusted_cost",
  "appraisal",
  "manager_mark",
  "third_party",
  "other",
] as const;
export type ValuationMethod = (typeof VALUATION_METHODS)[number];

export const METHOD_LABELS: Record<ValuationMethod, string> = {
  recent_financing: "Recent financing round",
  transaction_price: "Transaction price",
  secondary_transaction: "Observable secondary transaction",
  market_comparable: "Market comparable",
  public_market: "Public market mark",
  dcf: "Discounted cash flow",
  income_approach: "Income approach",
  cost: "Cost",
  adjusted_cost: "Adjusted cost",
  appraisal: "Appraisal",
  manager_mark: "Manager-provided valuation",
  third_party: "Third-party valuation",
  other: "Other documented methodology",
};

/**
 * Inputs a methodology must carry before the number can be reproduced later.
 * Methodology is never just free text.
 */
export const METHOD_REQUIRED_INPUTS: Record<ValuationMethod, string[]> = {
  recent_financing: ["round_name", "round_date", "price_per_share_cents"],
  transaction_price: ["transaction_date", "price_per_unit_cents"],
  secondary_transaction: ["transaction_date", "price_per_unit_cents", "counterparty"],
  market_comparable: ["comparables", "multiple", "metric_value"],
  public_market: ["ticker", "quote_date", "price_per_unit_cents"],
  dcf: ["discount_rate", "projection_years", "terminal_value_cents"],
  income_approach: ["income_cents", "capitalization_rate"],
  cost: [],
  adjusted_cost: ["adjustment_reason"],
  appraisal: ["appraiser", "appraisal_date"],
  manager_mark: ["manager_rationale"],
  third_party: ["provider", "report_date"],
  other: ["rationale"],
};

export function missingMethodInputs(
  method: ValuationMethod,
  inputs: Record<string, unknown> | null | undefined,
): string[] {
  const provided = inputs ?? {};
  return METHOD_REQUIRED_INPUTS[method].filter((key) => {
    const value = (provided as Record<string, unknown>)[key];
    return value === undefined || value === null || value === "";
  });
}

// ------------------------------------------------------------------ sources

export const VALUATION_SOURCE_TYPES = [
  "independent_third_party",
  "observable_transaction",
  "recent_financing",
  "public_market",
  "manager_mark",
  "internal_model",
  "other",
] as const;
export type ValuationSourceType = (typeof VALUATION_SOURCE_TYPES)[number];

export const SOURCE_LABELS: Record<ValuationSourceType, string> = {
  independent_third_party: "Independent third party",
  observable_transaction: "Observable transaction",
  recent_financing: "Recent financing",
  public_market: "Public market",
  manager_mark: "Manager mark",
  internal_model: "Internal model",
  other: "Other source",
};

export const DEFAULT_SOURCE_PRIORITY: ValuationSourceType[] = [
  "independent_third_party",
  "observable_transaction",
  "recent_financing",
  "public_market",
  "manager_mark",
];

export type SourceCandidate = {
  sourceType: ValuationSourceType;
  valueCents: number;
  sourceDate?: string | null;
  label?: string;
};

export type SourceDecision = {
  /** The highest-priority candidate, which is a *suggestion*, never authority. */
  preferred: SourceCandidate | null;
  conflicts: string[];
  /** True when Harmonious must look at it before anything becomes effective. */
  requiresReview: boolean;
};

/**
 * Ranks the available evidence by the fund's configured hierarchy. The winner
 * is never made authoritative automatically: material disagreement between
 * sources is returned as a conflict for the review queue.
 */
export function rankSources(
  candidates: SourceCandidate[],
  priority: ValuationSourceType[] = DEFAULT_SOURCE_PRIORITY,
  disagreementPct = 10,
): SourceDecision {
  if (candidates.length === 0) {
    return { preferred: null, conflicts: ["no_source"], requiresReview: true };
  }
  const rank = (s: ValuationSourceType) => {
    const index = priority.indexOf(s);
    return index === -1 ? priority.length + 1 : index;
  };
  const sorted = [...candidates].sort((a, b) => {
    const byRank = rank(a.sourceType) - rank(b.sourceType);
    if (byRank !== 0) return byRank;
    return String(b.sourceDate ?? "").localeCompare(String(a.sourceDate ?? ""));
  });
  const preferred = sorted[0]!;
  const conflicts: string[] = [];
  for (const other of sorted.slice(1)) {
    const base = Math.abs(preferred.valueCents) || 1;
    const gap = (Math.abs(other.valueCents - preferred.valueCents) / base) * 100;
    if (gap > disagreementPct) {
      conflicts.push(
        `${SOURCE_LABELS[other.sourceType]} differs from ${SOURCE_LABELS[preferred.sourceType]} by ${gap.toFixed(1)}%`,
      );
    }
  }
  return { preferred, conflicts, requiresReview: true };
}

// ----------------------------------------------------------------- lifecycle

export const VALUATION_STATUSES = [
  "draft",
  "review",
  "returned",
  "rejected",
  "approved",
  "effective",
  "superseded",
] as const;
export type ValuationStatus = (typeof VALUATION_STATUSES)[number];

const VALUATION_TRANSITIONS: Record<ValuationStatus, ValuationStatus[]> = {
  draft: ["review"],
  review: ["approved", "returned", "rejected"],
  returned: ["review"],
  rejected: [],
  approved: ["effective", "returned"],
  effective: ["superseded"],
  superseded: [],
};

export function canTransitionValuation(from: ValuationStatus, to: ValuationStatus) {
  return VALUATION_TRANSITIONS[from].includes(to);
}

/** Statuses whose numbers and evidence are frozen for good. */
export const IMMUTABLE_VALUATION_STATUSES: ValuationStatus[] = ["effective", "superseded"];

export function isImmutable(status: ValuationStatus) {
  return IMMUTABLE_VALUATION_STATUSES.includes(status);
}

// ------------------------------------------------------------------ policy

export type ValuationPolicy = {
  sourcePriority: ValuationSourceType[];
  stalenessDays: number;
  increaseThresholdPct: number;
  decreaseThresholdPct: number;
  materialChangeCents: number;
  evidenceRequired: boolean;
  managerMayApprove: boolean;
  managerReviewRequired: boolean;
  unrealizedPolicyEnabled: boolean;
  investmentAccountCode: string;
  unrealizedAccountCode: string;
  realizedAccountCode: string;
  costAccountCode: string;
  cashAccountCode: string;
};

export const DEFAULT_VALUATION_POLICY: ValuationPolicy = {
  sourcePriority: DEFAULT_SOURCE_PRIORITY,
  stalenessDays: 120,
  increaseThresholdPct: 25,
  decreaseThresholdPct: 20,
  materialChangeCents: 2_500_000,
  evidenceRequired: true,
  managerMayApprove: false,
  managerReviewRequired: false,
  unrealizedPolicyEnabled: true,
  investmentAccountCode: "1110",
  unrealizedAccountCode: "4400",
  realizedAccountCode: "4300",
  costAccountCode: "1100",
  cashAccountCode: "1000",
};

// ------------------------------------------------------------------ change

export function valuationChange(priorValueCents: number | null, valueCents: number) {
  const changeCents = valueCents - (priorValueCents ?? 0);
  const changePct =
    priorValueCents && priorValueCents !== 0
      ? (changeCents / Math.abs(priorValueCents)) * 100
      : null;
  return { changeCents, changePct };
}

export function daysBetween(fromIso: string, toIso: string) {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

// -------------------------------------------------------------- exceptions

export const VALUATION_EXCEPTION_KINDS = [
  "stale_valuation",
  "missing_valuation_source",
  "missing_valuation_methodology",
  "unsupported_valuation_change",
  "valuation_change_threshold",
  "missing_quantity",
  "missing_cost_basis",
  "impossible_valuation",
  "conflicting_valuation_sources",
  "missing_valuation_evidence",
] as const;
export type ValuationExceptionKind = (typeof VALUATION_EXCEPTION_KINDS)[number];

export type ValuationCandidate = {
  valueCents: number;
  priorValueCents: number | null;
  quantity?: number | null;
  costBasisCents?: number | null;
  methodology?: ValuationMethod | null;
  sourceType?: ValuationSourceType | null;
  source?: string | null;
  sourceDate?: string | null;
  valuationDate: string;
  inputs?: Record<string, unknown> | null;
  evidenceCount?: number;
  conflicts?: string[];
  assetClass?: PortfolioAssetClass;
};

/**
 * Everything wrong with a proposed valuation, named. Returning an empty list
 * is not approval — it only means nothing is obviously broken.
 */
export function valuationExceptions(
  candidate: ValuationCandidate,
  policy: ValuationPolicy = DEFAULT_VALUATION_POLICY,
  today: string = new Date().toISOString().slice(0, 10),
): ValuationExceptionKind[] {
  const found: ValuationExceptionKind[] = [];

  if (candidate.valueCents < 0 || !Number.isFinite(candidate.valueCents)) {
    found.push("impossible_valuation");
  }
  if (!candidate.methodology) found.push("missing_valuation_methodology");
  if (!candidate.sourceType || !candidate.source) found.push("missing_valuation_source");
  if (candidate.quantity === null || candidate.quantity === undefined) {
    if (candidate.assetClass !== "real_estate" && candidate.assetClass !== "other") {
      found.push("missing_quantity");
    }
  }
  if (candidate.costBasisCents === null || candidate.costBasisCents === undefined) {
    found.push("missing_cost_basis");
  }
  if (policy.evidenceRequired && (candidate.evidenceCount ?? 0) === 0) {
    found.push("missing_valuation_evidence");
  }
  if ((candidate.conflicts ?? []).length > 0) found.push("conflicting_valuation_sources");

  if (daysBetween(candidate.valuationDate, today) > policy.stalenessDays) {
    found.push("stale_valuation");
  }

  const { changeCents, changePct } = valuationChange(
    candidate.priorValueCents,
    candidate.valueCents,
  );
  if (changePct !== null) {
    const breached =
      (changePct > 0 && changePct > policy.increaseThresholdPct) ||
      (changePct < 0 && Math.abs(changePct) > policy.decreaseThresholdPct);
    if (breached) {
      found.push("valuation_change_threshold");
      const thinEvidence =
        (candidate.evidenceCount ?? 0) === 0 ||
        candidate.sourceType === "manager_mark" ||
        candidate.sourceType === "internal_model";
      if (thinEvidence && Math.abs(changeCents) >= policy.materialChangeCents) {
        found.push("unsupported_valuation_change");
      }
    }
  }
  if (candidate.methodology && missingMethodInputs(candidate.methodology, candidate.inputs).length > 0) {
    if (!found.includes("missing_valuation_methodology")) {
      found.push("missing_valuation_methodology");
    }
  }
  return [...new Set(found)];
}

/** A valuation whose last effective mark is older than the fund's threshold. */
export function isStale(
  lastValuationDate: string | null,
  policy: ValuationPolicy = DEFAULT_VALUATION_POLICY,
  today: string = new Date().toISOString().slice(0, 10),
) {
  if (!lastValuationDate) return true;
  return daysBetween(lastValuationDate, today) > policy.stalenessDays;
}

// -------------------------------------------------------------- GL shapes

export type ValuationJournalLine = { accountCode: string; debitCents?: number; creditCents?: number };
export type ValuationJournal = { memo: string; lines: ValuationJournalLine[] } | null;

/**
 * The unrealised mark-to-market entry for the *movement* between the last
 * recognised value and this one. A zero movement produces no entry at all,
 * which is what keeps a superseded-and-recomputed valuation from recognising
 * the same gain twice.
 */
export function unrealizedJournal(
  priorRecognizedCents: number | null,
  newValueCents: number,
  policy: ValuationPolicy = DEFAULT_VALUATION_POLICY,
  memo = "Unrealised valuation movement",
): ValuationJournal {
  if (!policy.unrealizedPolicyEnabled) return null;
  const delta = newValueCents - (priorRecognizedCents ?? 0);
  if (delta === 0) return null;
  if (delta > 0) {
    return {
      memo,
      lines: [
        { accountCode: policy.investmentAccountCode, debitCents: delta },
        { accountCode: policy.unrealizedAccountCode, creditCents: delta },
      ],
    };
  }
  const amount = Math.abs(delta);
  return {
    memo,
    lines: [
      { accountCode: policy.unrealizedAccountCode, debitCents: amount },
      { accountCode: policy.investmentAccountCode, creditCents: amount },
    ],
  };
}

// ------------------------------------------------------------ realizations

export type RealizationInput = {
  quantityHeld: number | null;
  quantitySold: number | null;
  costBasisCents: number;
  proceedsCents: number;
};

export type RealizationResult = {
  costBasisRelievedCents: number;
  realizedGainCents: number;
  remainingQuantity: number | null;
  remainingCostBasisCents: number;
  isFullDisposition: boolean;
};

/**
 * A disposition relieves cost and recognises a realised result. It never sets
 * the asset's fair value to zero — the remaining position keeps its own
 * unrealised marks.
 */
export function realization(input: RealizationInput): RealizationResult {
  const { quantityHeld, quantitySold, costBasisCents, proceedsCents } = input;
  if (proceedsCents < 0) throw new Error("Proceeds cannot be negative.");
  let fraction = 1;
  if (quantityHeld && quantitySold !== null && quantitySold !== undefined) {
    if (quantitySold <= 0) throw new Error("Quantity sold must be positive.");
    if (quantitySold > quantityHeld) throw new Error("Cannot sell more than the position held.");
    fraction = quantitySold / quantityHeld;
  }
  const costBasisRelievedCents = Math.round(costBasisCents * fraction);
  const remainingQuantity =
    quantityHeld === null || quantitySold === null || quantitySold === undefined
      ? quantityHeld
      : quantityHeld - quantitySold;
  return {
    costBasisRelievedCents,
    realizedGainCents: proceedsCents - costBasisRelievedCents,
    remainingQuantity,
    remainingCostBasisCents: costBasisCents - costBasisRelievedCents,
    isFullDisposition: fraction === 1 || remainingQuantity === 0,
  };
}

export function realizationJournal(
  result: RealizationResult,
  proceedsCents: number,
  policy: ValuationPolicy = DEFAULT_VALUATION_POLICY,
  memo = "Disposition of portfolio asset",
): ValuationJournal {
  const lines: ValuationJournalLine[] = [
    { accountCode: policy.cashAccountCode, debitCents: proceedsCents },
    { accountCode: policy.costAccountCode, creditCents: result.costBasisRelievedCents },
  ];
  const gain = result.realizedGainCents;
  if (gain > 0) lines.push({ accountCode: policy.realizedAccountCode, creditCents: gain });
  if (gain < 0) lines.push({ accountCode: policy.realizedAccountCode, debitCents: Math.abs(gain) });
  return { memo, lines };
}

export function journalBalances(journal: ValuationJournal) {
  if (!journal) return true;
  const debit = journal.lines.reduce((sum, l) => sum + (l.debitCents ?? 0), 0);
  const credit = journal.lines.reduce((sum, l) => sum + (l.creditCents ?? 0), 0);
  return debit === credit && debit > 0;
}

// ---------------------------------------------------------------- as-of

export type ValuationRecord = {
  id: string;
  assetId: string;
  effectiveDate: string;
  version: number;
  status: ValuationStatus;
  valueCents: number;
};

/**
 * The valuation that was effective on `date` — not today's latest mark.
 * Quarterly statements, NAV history, audits and amended reports all depend on
 * this being historically honest.
 */
export function valuationAsOf(
  versions: ValuationRecord[],
  date: string,
): ValuationRecord | null {
  const eligible = versions
    .filter((v) => v.status === "effective" || v.status === "superseded")
    .filter((v) => v.effectiveDate <= date)
    .sort((a, b) => {
      if (a.effectiveDate !== b.effectiveDate) {
        return a.effectiveDate < b.effectiveDate ? 1 : -1;
      }
      return b.version - a.version;
    });
  return eligible[0] ?? null;
}

export type PortfolioAsOfLine = {
  assetId: string;
  valuationId: string | null;
  valueCents: number;
  effectiveDate: string | null;
};

export function portfolioAsOf(
  assetIds: string[],
  versions: ValuationRecord[],
  date: string,
): { lines: PortfolioAsOfLine[]; totalValueCents: number } {
  const lines = assetIds.map((assetId) => {
    const match = valuationAsOf(
      versions.filter((v) => v.assetId === assetId),
      date,
    );
    return {
      assetId,
      valuationId: match?.id ?? null,
      valueCents: match?.valueCents ?? 0,
      effectiveDate: match?.effectiveDate ?? null,
    };
  });
  return { lines, totalValueCents: lines.reduce((sum, l) => sum + l.valueCents, 0) };
}

// ------------------------------------------------------------- authority

export type ValuationAction =
  | "submit"
  | "approve"
  | "return"
  | "reject"
  | "make_effective"
  | "supersede"
  | "acknowledge"
  | "challenge";

/**
 * What a fund manager may do. Approving or making a valuation effective is
 * Harmonious's decision unless the fund's own workflow explicitly grants it,
 * and even then Harmonious remains the final administrative layer.
 */
export function managerMay(action: ValuationAction, policy: ValuationPolicy): boolean {
  switch (action) {
    case "submit":
    case "acknowledge":
    case "challenge":
      return true;
    case "approve":
      return policy.managerMayApprove;
    case "return":
    case "reject":
    case "make_effective":
    case "supersede":
      return false;
  }
}
