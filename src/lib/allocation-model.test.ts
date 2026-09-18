import { describe, expect, it } from "vitest";

import {
  adjustmentError,
  adjustmentApprovalError,
  allocateRun,
  allocationSegregationError,
  allocationWeights,
  canTransitionRun,
  canTransitionStatement,
  carryConsumptionError,
  commitmentAsOf,
  distributeAmount,
  effectiveRateBps,
  feeReconciles,
  finalizationBlockers,
  fundTotalsFromHandoff,
  managementFee,
  managerMayAllocation,
  missingStatementProvenance,
  ownershipAsOf,
  participationDays,
  reconcileAllocations,
  statementSnapshot,
  transferError,
  weightedAverageCapitalCents,
  type CommitmentEvent,
  type PositionInput,
} from "./allocation-model";

const period = { start: "2026-01-01", end: "2026-03-31" };

const position = (over: Partial<PositionInput> & { positionId: string }): PositionInput => ({
  classId: null,
  isGp: false,
  admittedOn: "2025-01-01",
  withdrawnOn: null,
  beginningCapitalCents: 0,
  commitmentCents: 0,
  contributedToDateCents: 0,
  contributionsCents: 0,
  distributionsCents: 0,
  units: null,
  ownershipPct: null,
  cashFlows: [],
  ...over,
});

const handoff = {
  periodStart: period.start,
  periodEnd: period.end,
  netIncomeCents: 100_000,
  realizedGainCents: 0,
  unrealizedGainCents: 0,
  managementFeesCents: 20_000,
  fundExpensesCents: 10_000,
  contributionsCents: 0,
  distributionsCents: 0,
  endingNetAssetsCents: 0,
};

describe("participation and weighting", () => {
  it("counts only the days an investor was actually in the fund", () => {
    expect(participationDays(position({ positionId: "a" }), period)).toBe(90);
    expect(
      participationDays(position({ positionId: "b", admittedOn: "2026-03-01" }), period),
    ).toBe(31);
    expect(
      participationDays(position({ positionId: "c", withdrawnOn: "2025-12-31" }), period),
    ).toBe(0);
  });

  it("weights capital by the days it was at work", () => {
    const mid = position({
      positionId: "mid",
      beginningCapitalCents: 0,
      cashFlows: [{ date: "2026-02-15", amountCents: 900_000 }],
    });
    const full = position({ positionId: "full", beginningCapitalCents: 900_000 });
    expect(weightedAverageCapitalCents(mid, period)).toBeLessThan(
      weightedAverageCapitalCents(full, period),
    );
  });

  it("gives a late investor a smaller share than an original investor", () => {
    const weights = allocationWeights(
      [
        position({ positionId: "early", contributedToDateCents: 1_000_000 }),
        position({
          positionId: "late",
          admittedOn: "2026-03-01",
          contributedToDateCents: 1_000_000,
          cashFlows: [{ date: "2026-03-01", amountCents: 1_000_000 }],
        }),
      ],
      "contributed_capital",
      period,
      true,
    );
    const early = weights.find((w) => w.positionId === "early")!;
    const late = weights.find((w) => w.positionId === "late")!;
    expect(early.weight).toBeGreaterThan(late.weight);
  });
});

describe("exact distribution", () => {
  it("allocates every last cent with no rounding leak", () => {
    const weights = allocationWeights(
      [
        position({ positionId: "a", beginningCapitalCents: 1 }),
        position({ positionId: "b", beginningCapitalCents: 1 }),
        position({ positionId: "c", beginningCapitalCents: 1 }),
      ],
      "ownership_percentage",
      period,
      false,
    );
    const shares = distributeAmount(100, weights);
    expect([...shares.values()].reduce((s, v) => s + v, 0)).toBe(100);
  });

  it("keeps negative amounts exact too", () => {
    const weights = allocationWeights(
      [
        position({ positionId: "a", beginningCapitalCents: 2 }),
        position({ positionId: "b", beginningCapitalCents: 1 }),
      ],
      "ownership_percentage",
      period,
      false,
    );
    const shares = distributeAmount(-101, weights);
    expect([...shares.values()].reduce((s, v) => s + v, 0)).toBe(-101);
  });
});

describe("allocation reconciles to the fund", () => {
  const positions = [
    position({ positionId: "a", beginningCapitalCents: 600_000, commitmentCents: 1_000_000 }),
    position({ positionId: "b", beginningCapitalCents: 400_000, commitmentCents: 1_000_000 }),
  ];

  it("sums investor capital back to fund net assets", () => {
    const totals = fundTotalsFromHandoff({
      ...handoff,
      endingNetAssetsCents: 1_100_000,
    });
    const run = allocateRun({ positions, fundTotals: totals, basis: "ownership_percentage", period, timeWeighted: false });
    const sum = run.lines.reduce((s, l) => s + l.endingCapitalCents, 0);
    expect(sum).toBe(totals.endingNetAssetsCents);
    const reconciliation = reconcileAllocations(totals, run.allocatedTotals);
    expect(reconciliation.reconciles).toBe(true);
    expect(finalizationBlockers(reconciliation)).toEqual([]);
  });

  it("blocks finalization when a single cent is unexplained", () => {
    const totals = fundTotalsFromHandoff({ ...handoff, endingNetAssetsCents: 1_070_001 });
    const run = allocateRun({ positions, fundTotals: totals, basis: "ownership_percentage", period, timeWeighted: false });
    const reconciliation = reconcileAllocations(totals, run.allocatedTotals);
    expect(reconciliation.reconciles).toBe(false);
    expect(finalizationBlockers(reconciliation).length).toBeGreaterThan(0);
  });
});

describe("commitment ledger", () => {
  const events: CommitmentEvent[] = [
    { eventType: "original_commitment", amountCents: 1_000_000, effectiveDate: "2025-01-01" },
    { eventType: "commitment_amendment", amountCents: 1_500_000, effectiveDate: "2025-06-01" },
    { eventType: "contribution", amountCents: 500_000, effectiveDate: "2025-07-01" },
    { eventType: "distribution", amountCents: 100_000, effectiveDate: "2026-02-01" },
  ];

  it("answers as of a past date without today's figures", () => {
    const past = commitmentAsOf(events, "2025-12-31");
    expect(past.currentCommitmentCents).toBe(1_500_000);
    expect(past.contributedCents).toBe(500_000);
    expect(past.distributionsCents).toBe(0);
    expect(past.unfundedCommitmentCents).toBe(1_000_000);
  });

  it("keeps the original commitment visible after an amendment", () => {
    const now = commitmentAsOf(events);
    expect(now.originalCommitmentCents).toBe(1_000_000);
    expect(now.currentCommitmentCents).toBe(1_500_000);
    expect(now.distributionsCents).toBe(100_000);
  });
});

describe("management fees", () => {
  const term = {
    basis: "committed_capital" as const,
    rateBps: 200,
    flatAmountCents: 0,
    frequency: "quarterly" as const,
    startsOn: "2025-01-01",
    endsOn: null,
    stepDowns: [{ from: "2026-01-01", rateBps: 150 }],
    waiverBps: 0,
    offsetPct: 0,
  };

  it("applies the step-down in force for the period", () => {
    expect(effectiveRateBps(term, "2025-06-30")).toBe(200);
    expect(effectiveRateBps(term, period.end)).toBe(150);
  });

  it("charges a quarter of the annual rate for a quarter", () => {
    const fee = managementFee(term, 10_000_000, period);
    expect(fee.grossFeeCents).toBe(37_500);
    expect(fee.netFeeCents).toBe(37_500);
  });

  it("nets waivers and offsets, and flags a ledger mismatch", () => {
    const fee = managementFee({ ...term, waiverBps: 50, offsetPct: 10 }, 10_000_000, period);
    expect(fee.netFeeCents).toBeLessThan(fee.grossFeeCents);
    expect(feeReconciles(fee.netFeeCents, fee.netFeeCents)).toBe(true);
    expect(feeReconciles(fee.netFeeCents, fee.netFeeCents + 1)).toBe(false);
  });
});

describe("carried interest", () => {
  const waterfall = {
    structure: "european_whole_fund" as const,
    preferredReturnBps: 800,
    compounding: "annual" as const,
    catchUpPct: 100,
    carryPct: 20,
    returnOfCapitalFirst: true,
    clawbackTracked: true,
    tiers: [],
  };

  it("refuses carry with no documented waterfall", () => {
    expect(carryConsumptionError(null, [{ positionId: null, amountCents: 5_000 }])).toMatch(/waterfall/i);
  });

  it("accepts carry produced by approved terms", () => {
    expect(carryConsumptionError(waterfall, [{ positionId: "gp", amountCents: 5_000 }])).toBeNull();
  });
});

describe("controls", () => {
  it("stops one person preparing, reviewing and approving", () => {
    const people = { preparedBy: "amy", reviewedBy: null, approvedBy: null };
    expect(allocationSegregationError(people, "amy", "review")).toBeTruthy();
    expect(allocationSegregationError(people, "ben", "review")).toBeNull();
    expect(
      allocationSegregationError({ ...people, reviewedBy: "ben" }, "ben", "approve"),
    ).toBeTruthy();
    expect(
      allocationSegregationError({ ...people, reviewedBy: "ben" }, "cas", "approve"),
    ).toBeNull();
    expect(allocationSegregationError(people, null, "approve")).toBeTruthy();
  });

  it("only allows the documented run transitions", () => {
    expect(canTransitionRun("draft", "review")).toBe(true);
    expect(canTransitionRun("finalized", "draft")).toBe(false);
    expect(canTransitionStatement("published", "draft")).toBe(false);
    expect(canTransitionStatement("approved", "published")).toBe(true);
  });

  it("keeps managers out of authorship", () => {
    expect(managerMayAllocation("finalize", "approve")).toBe(false);
    expect(managerMayAllocation("approve", "acknowledge")).toBe(false);
    expect(managerMayAllocation("challenge", "acknowledge")).toBe(true);
    expect(managerMayAllocation("acknowledge", "none")).toBe(false);
    expect(managerMayAllocation("view", "none")).toBe(true);
  });

  it("requires a reason, evidence and a second person for an adjustment", () => {
    expect(
      adjustmentError({
        classification: "correction",
        amountCents: 1_000,
        reason: "typo",
        evidencePath: "x",
      }),
    ).toBeTruthy();
    expect(
      adjustmentError({
        classification: "correction",
        amountCents: 1_000,
        reason: "Corrects a misposted contribution from February.",
        evidencePath: "",
      }),
    ).toBeTruthy();
    expect(
      adjustmentApprovalError({ status: "pending", requested_by: "amy" }, "amy"),
    ).toBeTruthy();
    expect(adjustmentApprovalError({ status: "pending", requested_by: "amy" }, "ben")).toBeNull();
  });

  it("refuses a transfer to the same position or without authorisation", () => {
    expect(
      transferError({
        fromPositionId: "a",
        toPositionId: "a",
        capitalCents: 1,
        commitmentCents: 0,
        authorizationReference: "ref",
        effectiveDate: "2026-02-01",
      }),
    ).toBeTruthy();
    expect(
      transferError({
        fromPositionId: "a",
        toPositionId: "b",
        capitalCents: 1,
        commitmentCents: 0,
        authorizationReference: "",
        effectiveDate: "2026-02-01",
      }),
    ).toBeTruthy();
  });
});

describe("statements", () => {
  const account = {
    period_start: period.start,
    period_end: period.end,
    beginning_capital_cents: 600_000,
    contributions_cents: 0,
    allocated_income_cents: 60_000,
    allocated_loss_cents: 0,
    realized_gain_cents: 0,
    unrealized_gain_cents: 0,
    management_fees_cents: 12_000,
    fund_expenses_cents: 6_000,
    carried_interest_cents: 0,
    distributions_cents: 0,
    other_adjustments_cents: 0,
    ending_capital_cents: 642_000,
    commitment_cents: 1_000_000,
    contributed_to_date_cents: 600_000,
    unfunded_commitment_cents: 400_000,
    ownership_pct: 60,
    units: null,
    finalized_at: "2026-04-10T00:00:00Z",
  };

  it("presents the finalized account without recomputing it", () => {
    const snapshot = statementSnapshot(account, { fundName: "Fund A", investorName: "Amy" });
    expect(snapshot.endingCapitalCents).toBe(642_000);
    expect(snapshot.netInvestmentIncomeCents).toBe(60_000);
  });

  it("refuses a statement that cannot say where its figures came from", () => {
    expect(missingStatementProvenance({}).length).toBeGreaterThan(0);
    expect(
      missingStatementProvenance({
        navVersionId: "n",
        allocationRunId: "r",
        capitalAccountId: "c",
        capitalAccountVersion: 1,
        sourceCutoffAt: "2026-04-01T00:00:00Z",
        methodology: "allocation-v1",
      }),
    ).toEqual([]);
  });

  it("reads ownership as of a past date, not today", () => {
    const history = [
      { period_end: "2025-12-31", ownership_pct: 50 },
      { period_end: "2026-03-31", ownership_pct: 60 },
    ];
    expect(ownershipAsOf(history, "2026-01-31")).toBe(50);
    expect(ownershipAsOf(history, "2026-06-30")).toBe(60);
    expect(ownershipAsOf(history, "2024-01-01")).toBeNull();
  });
});
