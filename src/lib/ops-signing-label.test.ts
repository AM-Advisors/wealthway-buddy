import { describe, expect, it } from "vitest";
import { onboardingSigningLabel } from "@/lib/investment-lifecycle";
import { groupStalled } from "@/lib/stalled-investors-model";

describe("Operations signing wording matches fund manager lists", () => {
  it("unsigned investor at signing", () => expect(onboardingSigningLabel("signature", false)).toBe("Waiting on investor signature"));
  it("signed investor at signing", () => expect(onboardingSigningLabel("signature", true)).toBe("Investor signed: awaiting fund countersignature"));
  it("fund review stage", () => expect(onboardingSigningLabel("harmonious_review", false)).toBe("Investor signed: awaiting fund countersignature"));
  it("other stages untouched", () => expect(onboardingSigningLabel("verification", false)).toBeNull());
  it("stuck report separates signed from unsigned", () => {
    const base = { offering_id: "f", stage: "signature", last_activity_at: "2026-01-01", removed_at: null, merged_into_onboarding_id: null, is_test_investor: false };
    const g = groupStalled([{ ...base, id: "a" }, { ...base, id: "b", executed_snapshot: {} }], new Date("2026-02-01"));
    expect(g.map((x) => x.label).sort()).toEqual(["Investor signed: awaiting fund countersignature", "Waiting on investor signature"]);
  });
});
