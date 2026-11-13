import { describe, expect, it } from "vitest";

import { investorHomeAction, journeySteps } from "@/lib/investor-journey-model";
import type { RequirementResult } from "@/lib/investor-onboarding-model";

const r = (key: string, state: RequirementResult["state"], extra: Partial<RequirementResult> = {}): RequirementResult =>
  ({ key, label: key, state, ...extra }) as RequirementResult;

const facts = { stage: "signature", approvedToFund: false, fundingStatus: null, investorReportsSent: false };
const accreditationInReview = [
  r("account", "valid"), r("investment_profile", "valid"), r("investment_amount", "valid"),
  r("identity_verification", "valid"), r("aml", "valid"),
  r("accreditation", "review_required", { signingAllowed: true }),
  r("subscription_documents", "valid"), r("signature", "missing"), r("funding", "missing"),
];

describe("investor home next action", () => {
  it("asks the investor to sign while their accreditation is in review, instead of saying caught up", () => {
    const home = investorHomeAction(journeySteps(accreditationInReview, facts), { label: "Review accreditation", owner: "harmonious" });
    expect(home.nextAction).toBe("Review and sign your documents.");
    expect(home.waitingOn).toBeNull();
  });

  it("says Harmonious is reviewing only when nothing is left for the investor", () => {
    const signed = accreditationInReview.map((x) => (x.key === "signature" ? r("signature", "valid") : x));
    const home = investorHomeAction(journeySteps(signed, facts), { label: "Review accreditation", owner: "harmonious" });
    expect(home.nextAction).toBeNull();
    expect(home.waitingOn).toBe("harmonious");
  });
});
