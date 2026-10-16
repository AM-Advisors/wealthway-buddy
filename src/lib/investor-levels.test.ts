import { describe, expect, it } from "vitest";
import { investorLevel, portalFeatures, upgradeCheck } from "./investor-levels";

describe("investor levels", () => {
  it("unverified accreditation is Standard at any size", () => expect(investorLevel({ accredited: false, commitmentCents: 5_000_000_00 })).toBe("standard"));
  it("accredited under $250k", () => expect(investorLevel({ accredited: true, commitmentCents: 249_999_00 })).toBe("accredited"));
  it("accredited at $250k is Select", () => expect(investorLevel({ accredited: true, commitmentCents: 250_000_00 })).toBe("select"));
  it("qualified purchaser is at least Select", () => expect(investorLevel({ accredited: false, qualifiedPurchaser: true, commitmentCents: 10_000_00 })).toBe("select"));
  it("accredited at $1M is Premier", () => expect(investorLevel({ accredited: true, commitmentCents: 1_000_000_00 })).toBe("premier"));
  it("features need both level and paid tier", () => {
    expect(portalFeatures("premier", "self_serve")).toEqual([]);
    expect(portalFeatures("premier", "standard")).toEqual(["deal_room", "detailed_reports"]);
    expect(portalFeatures("accredited", "plus")).toEqual(["deal_room"]);
  });
  it("flags over the investor count", () => {
    const r = upgradeCheck("essentials", Array(26).fill("standard"));
    expect(r.needsUpgrade).toBe(true); expect(r.suggestedTier).toBe("standard");
  });
  it("flags premier investors on a tier without co-invest", () => {
    const r = upgradeCheck("standard", ["premier"]);
    expect(r.needsUpgrade).toBe(true); expect(r.suggestedTier).toBe("plus");
  });
  it("no flag when count and levels fit", () => expect(upgradeCheck("essentials", Array(25).fill("accredited")).needsUpgrade).toBe(false));
});
