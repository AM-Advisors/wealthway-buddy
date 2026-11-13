import { describe, expect, it } from "vitest";
import { canonicalInvestmentAttention } from "@/lib/attention-investment";

describe("Action Center investment item matches the investor home card", () => {
  it("uses the home card's exact next step words and opens that step", () => {
    expect(canonicalInvestmentAttention({
      nextAction: "Identity verified. Confirm your accreditation to continue.", waitingOn: null, complete: false, nextStep: "verify",
    })).toEqual({ step: "verify", status: "Identity verified. Confirm your accreditation to continue.", waiting: false });
  });
  it("never says 'Tell us who is investing' when the home card names a later step", () => {
    const r = canonicalInvestmentAttention({ nextAction: "Review and sign your documents.", waitingOn: null, complete: false, nextStep: "sign" });
    expect(r?.status).not.toBe("Tell us who is investing");
    expect(r?.step).toBe("sign");
  });
  it("is a waiting item, not a to-do, when nothing is on the investor", () => {
    expect(canonicalInvestmentAttention({ nextAction: null, waitingOn: "fund_manager", complete: false, nextStep: "sign" })?.waiting).toBe(true);
  });
  it("disappears once the investment is complete", () => {
    expect(canonicalInvestmentAttention({ nextAction: null, waitingOn: null, complete: true, nextStep: "fund" })).toBeNull();
  });
});
