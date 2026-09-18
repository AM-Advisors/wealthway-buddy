/**
 * Canonical investor-allocation vocabulary and arithmetic.
 *
 * Fund NAV → investor allocations → capital accounts → statements. Nothing in
 * this layer recreates fund accounting: every fund-level figure it allocates is
 * handed over by an approved NAV, and every investor figure must add back up to
 * it exactly. Everything here is pure so the rules can be tested without a
 * database.
 */

import type { CapitalHandoff } from "@/lib/nav-model";

// ------------------------------------------------------------------- bases

export const ALLOCATION_BASES = [
  "ownership_percentage",
  "contributed_capital",
  "committed_capital",
  "weighted_average_capital",
  "units",
  "specific_allocation",
  "class_series",
  "time_weighted_participation",
  "other",
] as const;
export type AllocationBasis = (typeof ALLOCATION_BASES)[number];

export const BASIS_LABELS: Record<AllocationBasis, string> = {
  ownership_percentage: "Ownership percentage",
  contributed_capital: "Contributed capital",
  committed_capital: "Committed capital",
  weighted_average_capital: "Weighted average capital",
  units: "Units or shares",
  specific_allocation: "Specific allocation",
  class_series: "Class or series",
  time_weighted_participation: "Time-weighted participation",
  other: "Other documented methodology",
};

// --------------------------------------------------------------- lifecycle

export const RUN_STATUSES = [
  "draft",
  "calculating",
  "review",
  "manager_review",
  "approved",
  "finalized",
  "superseded",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

const RUN_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  draft: ["calculating", "review"],
  calculating: ["draft", "review"],
  review: ["manager_review", "approved", "draft"],
  manager_review: ["review", "approved"],
  approved: ["finalized", "review"],
  finalized: ["superseded"],
  superseded: [],
};

export function canTransitionRun(from: RunStatus, to: RunStatus) {
  return RUN_TRANSITIONS[from].includes(to);
}

export const STATEMENT_STATUSES = [
  "draft",
  "review",
  "approved",
  "published",
  "superseded",
] as const;
export type StatementStatus = (typeof STATEMENT_STATUSES)[number];

const STATEMENT_TRANSITIONS: Record<StatementStatus, StatementStatus[]> = {
  draft: ["review"],
  review: ["approved", "draft"],
  approved: ["published", "review"],
  published: ["superseded"],
  superseded: [],
};

export function canTransitionStatement(from: StatementStatus, to: StatementStatus) {
  return STATEMENT_TRANSITIONS[from].includes(to);
}

export function isPublishedStatement(status: StatementStatus) {
  return status === "published" || status === "superseded";
}

// ------------------------------------------------------------ segregation

export type RunPeople = {
  preparedBy?: string | null;
  reviewedBy?: string | null;
  approvedBy?: string | null;
  finalizedBy?: string | null;
};

/**
 * Maker / checker. No automated actor stands in for a person, the preparer
 * never reviews or approves their own run, and nothing is approved before it
 * has been reviewed.
 */
export function allocationSegregationError(
  people: RunPeople,
  actorUserId: string | null,
  action: "review" | "approve" | "finalize" | "publish",
): string | null {
  if (!actorUserId) {
    return "A human approver is required; automated processes cannot approve allocations.";
  }
  if ((action === "review" || action === "approve") && people.preparedBy === actorUserId) {
    return `Allocations must be ${action}ed by someone other than the person who prepared them.`;
  }
  if (action === "approve" && people.reviewedBy === actorUserId) {
    return "Allocations must be approved by someone other than the person who reviewed them.";
  }
  if (action === "approve" && !people.reviewedBy) {
    return "Allocations must be reviewed before they can be approved.";
  }
  if ((action === "finalize" || action === "publish") && !people.approvedBy) {
    return "Allocations must be approved before capital accounts can be finalized.";
  }
  return null;
}

// -------------------------------------------------------------- positions

export type CashFlow = { date: string; amountCents: number };

export type PositionInput = {
  positionId: string;
  classId?: string | null;
  isGp?: boolean;
  admittedOn?: string | null;
  withdrawnOn?: string | null;
  beginningCapitalCents: number;
  commitmentCents: number;
  contributedToDateCents: number;
  contributionsCents: number;
  distributionsCents: number;
  units?: number | null;
  ownershipPct?: number | null;
  /** Only used by the specific_allocation basis. */
  specificWeight?: number | null;
  cashFlows?: CashFlow[];
};

export type Period = { start: string; end: string };

const DAY = 86_400_000;
const time = (d: string) => Date.parse(`${d}T00:00:00Z`);

export function daysInclusive(start: string, end: string) {
  return Math.max(0, Math.floor((time(end) - time(start)) / DAY) + 1);
}

/** Days of the period the investor was actually admitted for. */
export function participationDays(position: PositionInput, period: Period) {
  const start =
    position.admittedOn && time(position.admittedOn) > time(period.start)
      ? position.admittedOn
      : period.start;
  const end =
    position.withdrawnOn && time(position.withdrawnOn) < time(period.end)
      ? position.withdrawnOn
      : period.end;
  if (time(end) < time(start)) return 0;
  return daysInclusive(start, end);
}

/**
 * Capital weighted by the days it was actually in the fund. A December 30
 * investor therefore carries two days of weight, not a full year.
 */
export function weightedAverageCapitalCents(position: PositionInput, period: Period) {
  const totalDays = daysInclusive(period.start, period.end);
  if (totalDays === 0) return 0;
  const admitted =
    position.admittedOn && time(position.admittedOn) > time(period.start)
      ? position.admittedOn
      : period.start;
  const exit =
    position.withdrawnOn && time(position.withdrawnOn) < time(period.end)
      ? position.withdrawnOn
      : period.end;
  if (time(exit) < time(admitted)) return 0;

  const openingDays = daysInclusive(admitted, exit);
  let weighted = position.beginningCapitalCents * openingDays;

  for (const flow of position.cashFlows ?? []) {
    const flowDate = time(flow.date) < time(admitted) ? admitted : flow.date;
    if (time(flowDate) > time(exit)) continue;
    weighted += flow.amountCents * daysInclusive(flowDate, exit);
  }
  return Math.round(weighted / totalDays);
}

export function basisAmountCents(
  basis: AllocationBasis,
  position: PositionInput,
  period: Period,
  timeWeighted: boolean,
): number {
  const scale = (value: number) => {
    if (!timeWeighted) return value;
    const totalDays = daysInclusive(period.start, period.end);
    if (totalDays === 0) return 0;
    return Math.round((value * participationDays(position, period)) / totalDays);
  };

  switch (basis) {
    case "committed_capital":
      return scale(position.commitmentCents);
    case "contributed_capital":
      return scale(position.contributedToDateCents);
    case "weighted_average_capital":
      return weightedAverageCapitalCents(position, period);
    case "time_weighted_participation":
      return weightedAverageCapitalCents(position, period);
    case "units":
      return scale(Math.round((position.units ?? 0) * 100));
    case "specific_allocation":
      return Math.round((position.specificWeight ?? 0) * 1_000_000);
    case "ownership_percentage":
    case "class_series":
    case "other":
    default:
      return position.ownershipPct === null || position.ownershipPct === undefined
        ? scale(position.beginningCapitalCents + position.contributionsCents)
        : Math.round((position.ownershipPct ?? 0) * 1_000_000);
  }
}

export type Weight = {
  positionId: string;
  basisAmountCents: number;
  weight: number;
  daysInPeriod: number;
};

export function allocationWeights(
  positions: PositionInput[],
  basis: AllocationBasis,
  period: Period,
  timeWeighted: boolean,
): Weight[] {
  const amounts = positions.map((p) => ({
    positionId: p.positionId,
    basisAmountCents: basisAmountCents(basis, p, period, timeWeighted),
    daysInPeriod: participationDays(p, period),
  }));
  const total = amounts.reduce((sum, a) => sum + a.basisAmountCents, 0);
  return amounts.map((a) => ({
    ...a,
    weight: total === 0 ? 0 : a.basisAmountCents / total,
  }));
}

/**
 * Split a fund-level amount across weights so the parts add back to the whole
 * exactly — largest remainder, no rounding leakage.
 */
export function distributeAmount(totalCents: number, weights: Weight[]): Map<string, number> {
  const result = new Map<string, number>();
  if (weights.length === 0) return result;
  const sumWeights = weights.reduce((sum, w) => sum + w.weight, 0);
  if (sumWeights === 0) {
    weights.forEach((w) => result.set(w.positionId, 0));
    return result;
  }

  const sign = totalCents < 0 ? -1 : 1;
  const magnitude = Math.abs(totalCents);
  const raw = weights.map((w) => {
    const exact = (magnitude * w.weight) / sumWeights;
    const base = Math.floor(exact);
    return { positionId: w.positionId, base, remainder: exact - base };
  });
  let allocated = raw.reduce((sum, r) => sum + r.base, 0);
  const leftover = magnitude - allocated;
  const ordered = [...raw].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < leftover; i += 1) {
    const target = ordered[i % ordered.length];
    if (target) target.base += 1;
  }
  allocated = 0;
  for (const r of raw) {
    result.set(r.positionId, sign * r.base);
    allocated += r.base;
  }
  return result;
}

// ------------------------------------------------------------- allocation

export type FundTotals = {
  investmentIncomeCents: number;
  realizedGainCents: number;
  unrealizedGainCents: number;
  managementFeesCents: number;
  fundExpensesCents: number;
  carriedInterestCents: number;
  contributionsCents: number;
  distributionsCents: number;
  endingNetAssetsCents: number;
};

/** The only NAV output the allocation engine consumes. */
export function fundTotalsFromHandoff(
  handoff: CapitalHandoff,
  carriedInterestCents = 0,
): FundTotals {
  const investmentIncomeCents =
    handoff.netIncomeCents -
    handoff.realizedGainCents -
    handoff.unrealizedGainCents +
    handoff.managementFeesCents +
    handoff.fundExpensesCents;
  return {
    investmentIncomeCents,
    realizedGainCents: handoff.realizedGainCents,
    unrealizedGainCents: handoff.unrealizedGainCents,
    managementFeesCents: handoff.managementFeesCents,
    fundExpensesCents: handoff.fundExpensesCents,
    carriedInterestCents,
    contributionsCents: handoff.contributionsCents,
    distributionsCents: handoff.distributionsCents,
    endingNetAssetsCents: handoff.endingNetAssetsCents,
  };
}

export type AllocationLine = {
  positionId: string;
  classId: string | null;
  basis: AllocationBasis;
  basisAmountCents: number;
  weight: number;
  ownershipPct: number;
  daysInPeriod: number;
  beginningCapitalCents: number;
  contributionsCents: number;
  allocatedIncomeCents: number;
  realizedGainCents: number;
  unrealizedGainCents: number;
  allocatedLossCents: number;
  fundExpensesCents: number;
  managementFeesCents: number;
  carriedInterestCents: number;
  distributionsCents: number;
  otherAdjustmentsCents: number;
  endingCapitalCents: number;
  commitmentCents: number;
  contributedToDateCents: number;
  unfundedCommitmentCents: number;
  units: number | null;
};

export type AllocationInput = {
  positions: PositionInput[];
  fundTotals: FundTotals;
  basis: AllocationBasis;
  period: Period;
  timeWeighted: boolean;
  /** Per-position figures that are traced, not allocated. */
  perPositionFees?: Record<string, number>;
  perPositionCarry?: Record<string, number>;
  perPositionAdjustments?: Record<string, number>;
};

export type AllocationResult = {
  lines: AllocationLine[];
  weights: Weight[];
  allocatedTotals: FundTotals;
};

/** Ending = beginning + contributions + income + gains − losses − costs − distributions ± other. */
export function endingCapitalCents(line: Omit<AllocationLine, "endingCapitalCents">) {
  return (
    line.beginningCapitalCents +
    line.contributionsCents +
    line.allocatedIncomeCents +
    line.realizedGainCents +
    line.unrealizedGainCents -
    line.allocatedLossCents -
    line.fundExpensesCents -
    line.managementFeesCents -
    line.carriedInterestCents -
    line.distributionsCents +
    line.otherAdjustmentsCents
  );
}

export function allocateRun(input: AllocationInput): AllocationResult {
  const { positions, fundTotals: t, basis, period, timeWeighted } = input;
  const weights = allocationWeights(positions, basis, period, timeWeighted);
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);

  const income = distributeAmount(Math.max(t.investmentIncomeCents, 0), weights);
  const loss = distributeAmount(Math.max(-t.investmentIncomeCents, 0), weights);
  const realized = distributeAmount(t.realizedGainCents, weights);
  const unrealized = distributeAmount(t.unrealizedGainCents, weights);
  const expenses = distributeAmount(t.fundExpensesCents, weights);

  const feesTraced = input.perPositionFees ?? null;
  const fees = feesTraced ? null : distributeAmount(t.managementFeesCents, weights);
  const carryTraced = input.perPositionCarry ?? null;
  const carry = carryTraced ? null : distributeAmount(t.carriedInterestCents, weights);

  const lines: AllocationLine[] = positions.map((position) => {
    const w = weights.find((x) => x.positionId === position.positionId);
    const partial: Omit<AllocationLine, "endingCapitalCents"> = {
      positionId: position.positionId,
      classId: position.classId ?? null,
      basis,
      basisAmountCents: w?.basisAmountCents ?? 0,
      weight: w?.weight ?? 0,
      ownershipPct: totalWeight === 0 ? 0 : ((w?.weight ?? 0) / totalWeight) * 100,
      daysInPeriod: w?.daysInPeriod ?? 0,
      beginningCapitalCents: position.beginningCapitalCents,
      contributionsCents: position.contributionsCents,
      allocatedIncomeCents: income.get(position.positionId) ?? 0,
      realizedGainCents: realized.get(position.positionId) ?? 0,
      unrealizedGainCents: unrealized.get(position.positionId) ?? 0,
      allocatedLossCents: loss.get(position.positionId) ?? 0,
      fundExpensesCents: expenses.get(position.positionId) ?? 0,
      managementFeesCents:
        feesTraced?.[position.positionId] ?? fees?.get(position.positionId) ?? 0,
      carriedInterestCents:
        carryTraced?.[position.positionId] ?? carry?.get(position.positionId) ?? 0,
      distributionsCents: position.distributionsCents,
      otherAdjustmentsCents: input.perPositionAdjustments?.[position.positionId] ?? 0,
      commitmentCents: position.commitmentCents,
      contributedToDateCents: position.contributedToDateCents,
      unfundedCommitmentCents: Math.max(
        0,
        position.commitmentCents - position.contributedToDateCents,
      ),
      units: position.units ?? null,
    };
    return { ...partial, endingCapitalCents: endingCapitalCents(partial) };
  });

  const sum = (pick: (l: AllocationLine) => number) => lines.reduce((s, l) => s + pick(l), 0);
  const allocatedIncome = sum((l) => l.allocatedIncomeCents) - sum((l) => l.allocatedLossCents);

  return {
    lines,
    weights,
    allocatedTotals: {
      investmentIncomeCents: allocatedIncome,
      realizedGainCents: sum((l) => l.realizedGainCents),
      unrealizedGainCents: sum((l) => l.unrealizedGainCents),
      managementFeesCents: sum((l) => l.managementFeesCents),
      fundExpensesCents: sum((l) => l.fundExpensesCents),
      carriedInterestCents: sum((l) => l.carriedInterestCents),
      contributionsCents: sum((l) => l.contributionsCents),
      distributionsCents: sum((l) => l.distributionsCents),
      endingNetAssetsCents: sum((l) => l.endingCapitalCents),
    },
  };
}

// --------------------------------------------------------- reconciliation

export type ReconciliationLine = {
  key: keyof FundTotals;
  label: string;
  fundCents: number;
  allocatedCents: number;
  differenceCents: number;
};

export type AllocationReconciliation = {
  lines: ReconciliationLine[];
  differenceCents: number;
  reconciles: boolean;
};

const RECONCILIATION_LABELS: Record<keyof FundTotals, string> = {
  investmentIncomeCents: "Net investment income",
  realizedGainCents: "Realised gain/loss",
  unrealizedGainCents: "Unrealised gain/loss",
  managementFeesCents: "Management fees",
  fundExpensesCents: "Fund expenses",
  carriedInterestCents: "Carried interest",
  contributionsCents: "Contributions",
  distributionsCents: "Distributions",
  endingNetAssetsCents: "Ending capital",
};

/** Investor totals must equal the fund figure, line by line. */
export function reconcileAllocations(
  fundTotals: FundTotals,
  allocatedTotals: FundTotals,
  toleranceCents = 0,
): AllocationReconciliation {
  const keys = Object.keys(RECONCILIATION_LABELS) as (keyof FundTotals)[];
  const lines = keys.map((key) => ({
    key,
    label: RECONCILIATION_LABELS[key],
    fundCents: fundTotals[key],
    allocatedCents: allocatedTotals[key],
    differenceCents: allocatedTotals[key] - fundTotals[key],
  }));
  const differenceCents = lines.reduce((sum, l) => sum + Math.abs(l.differenceCents), 0);
  return {
    lines,
    differenceCents,
    reconciles: differenceCents <= Math.abs(toleranceCents),
  };
}

export function finalizationBlockers(reconciliation: AllocationReconciliation) {
  return reconciliation.reconciles
    ? []
    : reconciliation.lines
        .filter((l) => l.differenceCents !== 0)
        .map((l) => `${l.label} differs by ${l.differenceCents} cents.`);
}

// ------------------------------------------------------- commitment ledger

export const COMMITMENT_EVENT_TYPES = [
  "original_commitment",
  "commitment_amendment",
  "capital_call",
  "contribution",
  "pending_contribution",
  "contribution_settled",
  "distribution",
  "return_of_capital",
  "recallable_capital",
  "recall",
  "transfer_in",
  "transfer_out",
  "withdrawal",
] as const;
export type CommitmentEventType = (typeof COMMITMENT_EVENT_TYPES)[number];

export type CommitmentEvent = {
  eventType: CommitmentEventType;
  amountCents: number;
  effectiveDate: string;
};

export type CommitmentState = {
  originalCommitmentCents: number;
  currentCommitmentCents: number;
  calledCents: number;
  contributedCents: number;
  pendingContributionCents: number;
  unfundedCommitmentCents: number;
  recallableCents: number;
  distributionsCents: number;
  returnOfCapitalCents: number;
  remainingCommitmentCents: number;
};

/**
 * The commitment position as at a date, rebuilt from history. The original
 * commitment is never overwritten — amendments are separate events.
 */
export function commitmentAsOf(events: CommitmentEvent[], asOf?: string): CommitmentState {
  const cutoff = asOf ? time(asOf) : Number.POSITIVE_INFINITY;
  const inScope = events
    .filter((e) => time(e.effectiveDate) <= cutoff)
    .sort((a, b) => time(a.effectiveDate) - time(b.effectiveDate));

  const total = (type: CommitmentEventType) =>
    inScope.filter((e) => e.eventType === type).reduce((sum, e) => sum + e.amountCents, 0);

  const originalCommitmentCents = total("original_commitment");
  const amendments = inScope.filter((e) => e.eventType === "commitment_amendment");
  const transfers = total("transfer_in") - total("transfer_out");
  const currentCommitmentCents =
    (amendments.length
      ? Number(amendments[amendments.length - 1]?.amountCents ?? originalCommitmentCents)
      : originalCommitmentCents) + transfers;

  const contributedCents = total("contribution") + total("contribution_settled");
  const pendingContributionCents = total("pending_contribution");
  const calledCents = total("capital_call");
  const recallableCents = total("recallable_capital") - total("recall");
  const returnOfCapitalCents = total("return_of_capital");
  const distributionsCents = total("distribution") + returnOfCapitalCents;

  const unfundedCommitmentCents = Math.max(0, currentCommitmentCents - contributedCents);
  return {
    originalCommitmentCents,
    currentCommitmentCents,
    calledCents,
    contributedCents,
    pendingContributionCents,
    unfundedCommitmentCents,
    recallableCents,
    distributionsCents,
    returnOfCapitalCents,
    remainingCommitmentCents: unfundedCommitmentCents + Math.max(0, recallableCents),
  };
}

// --------------------------------------------------------- management fees

export const FEE_BASES = [
  "committed_capital",
  "invested_capital",
  "net_asset_value",
  "cost_basis",
  "flat",
  "other",
] as const;
export type FeeBasis = (typeof FEE_BASES)[number];

export const FEE_FREQUENCIES = [
  "monthly",
  "quarterly",
  "semi_annually",
  "annually",
  "one_time",
] as const;
export type FeeFrequency = (typeof FEE_FREQUENCIES)[number];

export const PERIODS_PER_YEAR: Record<FeeFrequency, number> = {
  monthly: 12,
  quarterly: 4,
  semi_annually: 2,
  annually: 1,
  one_time: 1,
};

export type FeeTerm = {
  basis: FeeBasis;
  rateBps: number;
  flatAmountCents: number;
  frequency: FeeFrequency;
  startsOn: string;
  endsOn?: string | null;
  /** [{ from: "2028-01-01", rateBps: 150 }] — applied by effective date. */
  stepDowns?: { from: string; rateBps: number }[];
  waiverBps?: number;
  offsetPct?: number;
};

export function effectiveRateBps(term: FeeTerm, asOf: string) {
  const steps = (term.stepDowns ?? [])
    .filter((s) => time(s.from) <= time(asOf))
    .sort((a, b) => time(a.from) - time(b.from));
  const stepped = steps.length ? Number(steps[steps.length - 1]?.rateBps ?? term.rateBps) : term.rateBps;
  return Math.max(0, stepped - (term.waiverBps ?? 0));
}

export type FeeCalculation = {
  basis: FeeBasis;
  basisAmountCents: number;
  rateBps: number;
  grossFeeCents: number;
  waiverCents: number;
  offsetCents: number;
  netFeeCents: number;
};

/** Fee for one period from versioned terms — never a typed-in number. */
export function managementFee(
  term: FeeTerm,
  basisAmountCents: number,
  period: Period,
): FeeCalculation {
  if (time(period.end) < time(term.startsOn)) {
    return {
      basis: term.basis,
      basisAmountCents,
      rateBps: 0,
      grossFeeCents: 0,
      waiverCents: 0,
      offsetCents: 0,
      netFeeCents: 0,
    };
  }
  if (term.endsOn && time(period.start) > time(term.endsOn)) {
    return {
      basis: term.basis,
      basisAmountCents,
      rateBps: 0,
      grossFeeCents: 0,
      waiverCents: 0,
      offsetCents: 0,
      netFeeCents: 0,
    };
  }

  const periods = PERIODS_PER_YEAR[term.frequency];
  const headlineBps = (term.stepDowns ?? []).length
    ? effectiveRateBps({ ...term, waiverBps: 0 }, period.end)
    : term.rateBps;
  const netBps = effectiveRateBps(term, period.end);

  const grossFeeCents =
    term.basis === "flat"
      ? Math.round(term.flatAmountCents)
      : Math.round((basisAmountCents * headlineBps) / 10_000 / periods);
  const netBeforeOffset =
    term.basis === "flat"
      ? grossFeeCents
      : Math.round((basisAmountCents * netBps) / 10_000 / periods);
  const waiverCents = grossFeeCents - netBeforeOffset;
  const offsetCents = Math.round((netBeforeOffset * (term.offsetPct ?? 0)) / 100);

  return {
    basis: term.basis,
    basisAmountCents,
    rateBps: netBps,
    grossFeeCents,
    waiverCents,
    offsetCents,
    netFeeCents: netBeforeOffset - offsetCents,
  };
}

/** The fee charged to investors must equal the fee the ledger recognised. */
export function feeReconciles(calculatedCents: number, ledgerCents: number, toleranceCents = 0) {
  return Math.abs(calculatedCents - ledgerCents) <= Math.abs(toleranceCents);
}

// -------------------------------------------------------------- waterfall

export const WATERFALL_STRUCTURES = [
  "none",
  "spv_simple",
  "european_whole_fund",
  "american_deal_by_deal",
  "tiered",
  "other",
] as const;
export type WaterfallStructure = (typeof WATERFALL_STRUCTURES)[number];

export type WaterfallTerms = {
  structure: WaterfallStructure;
  preferredReturnBps: number;
  compounding: "none" | "simple" | "annual" | "quarterly";
  catchUpPct: number;
  carryPct: number;
  returnOfCapitalFirst: boolean;
  clawbackTracked: boolean;
  tiers: { name: string; thresholdBps?: number; splitPct: number }[];
};

export type CarryOutput = { positionId: string | null; amountCents: number; tier?: string | null };

/**
 * Capital accounts consume an approved waterfall result; they never invent one.
 * A carry figure with no approved terms behind it is rejected.
 */
export function carryConsumptionError(
  terms: WaterfallTerms | null,
  outputs: CarryOutput[],
): string | null {
  const total = outputs.reduce((sum, o) => sum + o.amountCents, 0);
  if (total === 0) return null;
  if (!terms || terms.structure === "none") {
    return "Carried interest cannot be allocated without approved waterfall terms.";
  }
  return null;
}

export function clawbackCents(carryPaidCents: number, carryEarnedToDateCents: number) {
  return Math.max(0, carryPaidCents - carryEarnedToDateCents);
}

// ----------------------------------------------------- manual adjustments

export const ADJUSTMENT_CLASSIFICATIONS = [
  "correction",
  "rebalance",
  "expense_reallocation",
  "fee_adjustment",
  "carry_adjustment",
  "transfer_adjustment",
  "tax_adjustment",
  "other",
] as const;
export type AdjustmentClassification = (typeof ADJUSTMENT_CLASSIFICATIONS)[number];

export const MIN_ADJUSTMENT_REASON_LENGTH = 20;

export type AdjustmentRequest = {
  classification?: string | null;
  reason?: string | null;
  evidencePath?: string | null;
  amountCents?: number | null;
};

/** Nothing moves an investor's capital without a classification, a written reason and evidence. */
export function adjustmentError(request: AdjustmentRequest): string | null {
  if (
    !request.classification ||
    !(ADJUSTMENT_CLASSIFICATIONS as readonly string[]).includes(request.classification)
  ) {
    return "Choose what kind of adjustment this is.";
  }
  if (!request.amountCents) return "An adjustment needs an amount.";
  if ((request.reason ?? "").trim().length < MIN_ADJUSTMENT_REASON_LENGTH) {
    return `Explain the adjustment in at least ${MIN_ADJUSTMENT_REASON_LENGTH} characters.`;
  }
  if (!request.evidencePath) return "Attach the evidence supporting this adjustment.";
  return null;
}

/** An adjustment only affects a capital account once a second person approves it. */
export function adjustmentApprovalError(
  adjustment: { status: string; requested_by?: string | null },
  actorUserId: string | null,
): string | null {
  if (!actorUserId) return "A human approver is required.";
  if (adjustment.status !== "pending") return "That adjustment has already been decided.";
  if (adjustment.requested_by === actorUserId) {
    return "An adjustment must be approved by someone other than the person who requested it.";
  }
  return null;
}

// ------------------------------------------------------------- manager rights

export const ALLOCATION_MANAGER_WORKFLOWS = ["none", "acknowledge", "approve"] as const;
export type AllocationManagerWorkflow = (typeof ALLOCATION_MANAGER_WORKFLOWS)[number];

export type ManagerAllocationAction = "view" | "acknowledge" | "challenge" | "approve" | "finalize";

/** Managers read, acknowledge and challenge. They never change a finalized figure. */
export function managerMayAllocation(
  action: ManagerAllocationAction,
  workflow: AllocationManagerWorkflow,
): boolean {
  switch (action) {
    case "view":
      return true;
    case "acknowledge":
    case "challenge":
      return workflow !== "none";
    case "approve":
      return workflow === "approve";
    case "finalize":
      return false;
  }
}

// ---------------------------------------------------------------- statements

export type StatementSnapshot = {
  fundName: string;
  legalEntityName: string | null;
  investorName: string;
  profileLabel: string | null;
  periodStart: string;
  periodEnd: string;
  beginningCapitalCents: number;
  contributionsCents: number;
  distributionsCents: number;
  netInvestmentIncomeCents: number;
  realizedGainCents: number;
  unrealizedGainCents: number;
  managementFeesCents: number;
  fundExpensesCents: number;
  carriedInterestCents: number;
  otherAdjustmentsCents: number;
  endingCapitalCents: number;
  commitmentCents: number;
  contributedToDateCents: number;
  unfundedCommitmentCents: number;
  ownershipPct: number | null;
  units: number | null;
};

export type FinalizedCapitalAccount = {
  period_start: string;
  period_end: string;
  beginning_capital_cents: number;
  contributions_cents: number;
  allocated_income_cents: number;
  allocated_loss_cents: number;
  realized_gain_cents: number;
  unrealized_gain_cents: number;
  management_fees_cents: number;
  fund_expenses_cents: number;
  carried_interest_cents: number;
  distributions_cents: number;
  other_adjustments_cents: number;
  ending_capital_cents: number;
  commitment_cents: number;
  contributed_to_date_cents: number;
  unfunded_commitment_cents: number;
  ownership_pct: number | string | null;
  units: number | string | null;
  finalized_at?: string | null;
};

/**
 * A statement is a presentation of a finalized capital account. It never
 * recalculates a balance of its own.
 */
export function statementSnapshot(
  account: FinalizedCapitalAccount,
  descriptive: {
    fundName: string;
    legalEntityName?: string | null;
    investorName: string;
    profileLabel?: string | null;
  },
): StatementSnapshot {
  return {
    fundName: descriptive.fundName,
    legalEntityName: descriptive.legalEntityName ?? null,
    investorName: descriptive.investorName,
    profileLabel: descriptive.profileLabel ?? null,
    periodStart: account.period_start,
    periodEnd: account.period_end,
    beginningCapitalCents: Number(account.beginning_capital_cents),
    contributionsCents: Number(account.contributions_cents),
    distributionsCents: Number(account.distributions_cents),
    netInvestmentIncomeCents:
      Number(account.allocated_income_cents) - Number(account.allocated_loss_cents),
    realizedGainCents: Number(account.realized_gain_cents),
    unrealizedGainCents: Number(account.unrealized_gain_cents),
    managementFeesCents: Number(account.management_fees_cents),
    fundExpensesCents: Number(account.fund_expenses_cents),
    carriedInterestCents: Number(account.carried_interest_cents),
    otherAdjustmentsCents: Number(account.other_adjustments_cents),
    endingCapitalCents: Number(account.ending_capital_cents),
    commitmentCents: Number(account.commitment_cents),
    contributedToDateCents: Number(account.contributed_to_date_cents),
    unfundedCommitmentCents: Number(account.unfunded_commitment_cents),
    ownershipPct: account.ownership_pct === null ? null : Number(account.ownership_pct),
    units: account.units === null ? null : Number(account.units),
  };
}

export const REQUIRED_STATEMENT_PROVENANCE = [
  "navVersionId",
  "allocationRunId",
  "capitalAccountId",
  "capitalAccountVersion",
  "sourceCutoffAt",
  "methodology",
] as const;

export function missingStatementProvenance(provenance: Record<string, unknown>) {
  return REQUIRED_STATEMENT_PROVENANCE.filter(
    (key) => provenance[key] === undefined || provenance[key] === null || provenance[key] === "",
  );
}

// ------------------------------------------------------------ as-of reads

export type HistoricalRecord = { period_end: string };

/** Historical reporting reads the record that was effective then, never today's. */
export function asOfRecord<T extends HistoricalRecord>(records: T[], asOf: string): T | null {
  const eligible = records
    .filter((r) => time(r.period_end) <= time(asOf))
    .sort((a, b) => time(b.period_end) - time(a.period_end));
  return eligible[0] ?? null;
}

export function ownershipAsOf(
  records: (HistoricalRecord & { ownership_pct: number | string | null })[],
  asOf: string,
): number | null {
  const record = asOfRecord(records, asOf);
  if (!record || record.ownership_pct === null) return null;
  return Number(record.ownership_pct);
}

// ---------------------------------------------------------------- transfers

export type TransferRequest = {
  fromPositionId: string;
  toPositionId: string;
  capitalCents: number;
  commitmentCents: number;
  authorizationReference?: string | null;
  effectiveDate?: string | null;
};

/** Transfers move economics forward; they never rewrite what the transferor held. */
export function transferError(request: TransferRequest): string | null {
  if (request.fromPositionId === request.toPositionId) {
    return "A transfer needs a different transferee.";
  }
  if (request.capitalCents < 0 || request.commitmentCents < 0) {
    return "Transfer amounts cannot be negative.";
  }
  if (request.capitalCents === 0 && request.commitmentCents === 0) {
    return "A transfer must move capital, commitment or both.";
  }
  if (!(request.authorizationReference ?? "").trim()) {
    return "Record the authorisation for this transfer.";
  }
  if (!request.effectiveDate) return "A transfer needs an effective date.";
  return null;
}

// ------------------------------------------------------------- tax handoff

/**
 * Book capital and tax allocations are deliberately separate. Step 8 consumes
 * these classifications; nothing here assumes book equals tax.
 */
export const TAX_ALLOCATION_KEYS = [
  "ordinary_income",
  "interest_income",
  "dividend_income",
  "short_term_capital_gain",
  "long_term_capital_gain",
  "section_1231",
  "deductions",
  "foreign_taxes",
  "other",
] as const;
export type TaxAllocationKey = (typeof TAX_ALLOCATION_KEYS)[number];

export function emptyTaxAllocations(): Record<TaxAllocationKey, number> {
  return TAX_ALLOCATION_KEYS.reduce(
    (acc, key) => ({ ...acc, [key]: 0 }),
    {} as Record<TaxAllocationKey, number>,
  );
}
