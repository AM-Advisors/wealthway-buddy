import { describe, expect, it } from "vitest";
import { allocateShares, distributionFee, validateSetup, CASH_DISTRIBUTION_FEE_CENTS } from "./distributions-inkind-model";

describe("in-kind distributions", () => {
  it("allocates every whole share by weight", () => {
    const r = allocateShares(100, [{ key: "a", weight: 1 }, { key: "b", weight: 1 }, { key: "c", weight: 1 }]);
    expect(r.allocations.reduce((s, a) => s + a.shares, 0)).toBe(100);
    expect(r.allocations.map((a) => a.shares)).toEqual([34, 33, 33]);
    expect(r.unallocated).toBe(0);
  });
  it("handles zero weights", () => {
    expect(allocateShares(10, [{ key: "a", weight: 0 }]).unallocated).toBe(10);
  });
  it("prices cash at the standard fee and quotes others", () => {
    expect(distributionFee("cash")).toEqual({ harmoniousFeeCents: CASH_DISTRIBUTION_FEE_CENTS, custodianCostCents: 0, needsApproval: false });
    expect(distributionFee("shares", { harmoniousFeeCents: 100, custodianCostCents: 50 }).needsApproval).toBe(true);
  });
  it("validates share inputs", () => {
    expect(validateSetup({ kind: "shares", shareCount: 1.5 }).length).toBeGreaterThan(0);
    expect(validateSetup({ kind: "cash", cashCents: 100 })).toEqual([]);
  });
});
