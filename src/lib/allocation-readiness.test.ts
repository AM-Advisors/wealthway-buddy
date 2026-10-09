import { describe, it, expect } from "vitest";
import { allocationReadinessBlockers, type ReadinessInput } from "@/lib/allocation-readiness";
import { allocateRun, distributeAmount, reconcileAllocations, finalizationBlockers, allocationSegregationError, carryConsumptionError, type FundTotals } from "@/lib/allocation-model";

// Isolated synthetic fixtures only - no database.
const base: ReadinessInput = {
  offeringId: "F", fundOpeningNetAssetsCents: 1000,
  positions: [
    { positionId: "a", offeringId: "F", classId: "A", openingCapitalCents: 600, openingCapitalSourced: true },
    { positionId: "b", offeringId: "F", classId: "B", openingCapitalCents: 400, openingCapitalSourced: true },
  ],
  approvedAllocationPolicy: true, navApprovalScope: "production", navPublished: true,
  feeLineTotalCents: 100, postedFeeExpenseCents: 100, unapprovedSideLetterTermsApplied: 0,
  carryAllocatedCents: 0, approvedWaterfallTerms: false,
};

describe("allocation readiness gate", () => {
  it("passes a fully supported fixture", () => expect(allocationReadinessBlockers(base)).toEqual([]));
  it("missing allocation policy blocks", () => expect(allocationReadinessBlockers({ ...base, approvedAllocationPolicy: false })[0]).toMatch(/allocation policy/));
  it("missing opening capital blocks (never spread pro rata)", () => {
    const r = allocationReadinessBlockers({ ...base, positions: [base.positions[0]!, { ...base.positions[1]!, openingCapitalCents: null, openingCapitalSourced: false }] });
    expect(r.join()).toMatch(/Opening capital not supported for 1/);
  });
  it("opening capital must equal fund opening net assets", () => {
    expect(allocationReadinessBlockers({ ...base, fundOpeningNetAssetsCents: 1001 }).join()).toMatch(/does not equal/);
  });
  it("synthetic or unpublished NAV cannot enter production capital accounts", () => {
    expect(allocationReadinessBlockers({ ...base, navApprovalScope: "internal_synthetic_only", navPublished: false }).join()).toMatch(/published production NAV/);
  });
  it("positions from another fund are refused", () => {
    expect(allocationReadinessBlockers({ ...base, positions: [{ ...base.positions[0]!, offeringId: "OTHER" }, base.positions[1]!] }).join()).toMatch(/different fund/);
  });
  it("traced fee lines must equal the posted fee (no duplicate charge)", () => {
    expect(allocationReadinessBlockers({ ...base, feeLineTotalCents: 200 }).join()).toMatch(/fee lines/);
  });
  it("unapproved side letters cannot change economics", () => {
    expect(allocationReadinessBlockers({ ...base, unapprovedSideLetterTermsApplied: 1 }).join()).toMatch(/side-letter/);
  });
});

describe("allocation engine controls", () => {
  const totals: FundTotals = { investmentIncomeCents: 0, realizedGainCents: 0, unrealizedGainCents: 100, managementFeesCents: 30, fundExpensesCents: 10, carriedInterestCents: 0, contributionsCents: 0, distributionsCents: 0, endingNetAssetsCents: 0 };
  const positions = [
    { positionId: "a", classId: "A", commitmentCents: 2, contributedToDateCents: 2, beginningCapitalCents: 0, contributionsCents: 0, distributionsCents: 0 },
    { positionId: "b", classId: "B", commitmentCents: 1, contributedToDateCents: 1, beginningCapitalCents: 0, contributionsCents: 0, distributionsCents: 0 },
  ] as any;
  it("traced class fees are used as-is, never re-spread", () => {
    const r = allocateRun({ positions, fundTotals: totals, basis: "committed_capital", period: { start: "2026-01-01", end: "2026-03-31" }, timeWeighted: false, perPositionFees: { a: 25, b: 5 } });
    expect(r.allocatedTotals.managementFeesCents).toBe(30);
    expect(r.lines.find((l) => l.positionId === "b")!.managementFeesCents).toBe(5);
  });
  it("rounding residuals are assigned visibly and totals tie exactly", () => {
    const m = distributeAmount(100, [{ positionId: "a", weight: 1 }, { positionId: "b", weight: 1 }, { positionId: "c", weight: 1 }] as any);
    expect([...m.values()].reduce((s, v) => s + v, 0)).toBe(100);
    expect([...m.values()].sort()).toEqual([33, 33, 34]);
  });
  it("allocated totals must equal fund totals", () => {
    const rec = reconcileAllocations(totals, { ...totals, fundExpensesCents: 11 });
    expect(rec.reconciles).toBe(false);
    expect(finalizationBlockers(rec)[0]).toMatch(/1 cents/);
  });
  it("self-review and self-approval are refused", () => {
    expect(allocationSegregationError({ preparedBy: "p" }, "p", "review")).not.toBeNull();
    expect(allocationSegregationError({ preparedBy: "p", reviewedBy: "r" }, "r", "approve")).not.toBeNull();
  });
  it("carry without approved waterfall terms is refused", () => {
    expect(carryConsumptionError(null, [{ positionId: "a", amountCents: 1 }])).toMatch(/waterfall/);
  });
});
