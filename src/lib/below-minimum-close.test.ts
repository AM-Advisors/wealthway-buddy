import { describe, expect, it } from "vitest";
import { canCloseInvestment } from "@/lib/investor-onboarding-model";

const base = { stage: "funded", requirements: [], approvedToFundAt: "2026-11-01", openBlockingExceptions: 0, fundingStatus: "funded" as any, fundingReconciled: true, acceptedAt: "2026-11-02", acceptedAmountCents: 25_000_000 };

describe("below-minimum close gate", () => {
  it("blocks close until the side letter is approved", () => {
    expect(canCloseInvestment({ ...base, minimumSideLetterMissing: true }).allowed).toBe(false);
  });
  it("closes once the side letter is approved", () => {
    expect(canCloseInvestment({ ...base, minimumSideLetterMissing: false }).allowed).toBe(true);
  });
});
