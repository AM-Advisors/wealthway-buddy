import { describe, expect, it } from "vitest";
import { buildFundCapTable, type CapInvestment } from "./fund-cap-table";

const inv = (p: Partial<CapInvestment>): CapInvestment => ({
  id: "x", investorName: "A", profileName: null, classKey: "A", stage: "signed", fundingStatus: null,
  commitmentCents: 0, acceptedCents: null, fundedCents: null, units: null, removed: false, ...p,
});
const base = { managementFeePercent: 2, carryPercent: 20, preferredReturnPercent: 8 };
const today = new Date("2026-06-01");

describe("buildFundCapTable", () => {
  it("computes ownership and counts only reconciled funding", () => {
    const t = buildFundCapTable([
      inv({ id: "1", commitmentCents: 75_00, fundingStatus: "funded", fundedCents: 75_00 }),
      inv({ id: "2", commitmentCents: 25_00, fundingStatus: "pending", fundedCents: 25_00 }),
      inv({ id: "3", commitmentCents: 999_00, removed: true }),
      inv({ id: "4", commitmentCents: 999_00, stage: "declined" }),
    ], {}, base, [], today);
    expect(t.totals).toEqual({ investors: 2, commitCents: 100_00, fundedCents: 75_00 });
    expect(t.rows[0]!.pctCommitted).toBe(75);
    expect(t.rows[0]!.pctFunded).toBe(100);
    expect(t.rows[1]!.pctFunded).toBe(0);
  });

  it("layers live side letter terms and falls back after expiry", () => {
    const letter = (expiry: string) => ({
      id: "s", onboardingId: "1", status: "active", mfnEnabled: true, effectiveDate: null, expiryDate: expiry,
      terms: [{ category: "fee_discount", value: "1.5%", description: "discount" }],
    });
    const live = buildFundCapTable([inv({ id: "1", commitmentCents: 1 })], {}, base, [letter("2027-01-01")], today);
    expect(live.rows[0]!.terms[0]!.overrideText).toBe("1.5%");
    expect(live.rows[0]!.sideLetter?.status).toBe("active");
    const old = buildFundCapTable([inv({ id: "1", commitmentCents: 1 })], {}, base, [letter("2026-01-01")], today);
    expect(old.rows[0]!.terms[0]!.overrideText).toBeNull();
    expect(old.rows[0]!.sideLetter?.status).toBe("expired");
  });

  it("totals by class", () => {
    const t = buildFundCapTable([
      inv({ id: "1", classKey: "A", commitmentCents: 10 }),
      inv({ id: "2", classKey: "B", commitmentCents: 30 }),
    ], { B: { ...base, managementFeePercent: 1 } }, base, [], today);
    expect(t.classes.find((c) => c.classKey === "B")!.pctCommitted).toBe(75);
    expect(t.rows.find((r) => r.id === "2")!.terms[0]!.classValue).toBe(1);
  });
});
