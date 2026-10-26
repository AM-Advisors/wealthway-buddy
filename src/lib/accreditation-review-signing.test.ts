import { describe, expect, it } from "vitest";
import { canInvestorFund, determineOnboardingRequirements, verificationAllowsSigning } from "./investor-onboarding-model";

const now = "2026-10-26T20:00:00Z";
const reqs = (accreditationStatus: string | null, accreditationMethod = "third_party_letter") => determineOnboardingRequirements({
  offering: { accreditationRequired: true, accreditationMethod: "verified", kycRequired: true, kybRequired: true, amlRequired: true, taxDocumentRequired: false, subscriptionQuestionnaireRequired: false },
  person: { personId: "p", kycStatus: "approved", amlStatus: "approved" },
  profile: { profileId: "pr", profileType: "individual", accreditationStatus, accreditationMethod },
  subscription: { requestedAmountCents: 10000, documentsPrepared: true }, nowIso: now,
} as any);

describe("accreditation under review", () => {
  it("lets the investor keep going to Sign while paperwork is reviewed", () => {
    expect(verificationAllowsSigning(reqs("review"))).toBe(true);
  });
  it("still blocks signing with no paperwork or rejected paperwork", () => {
    expect(verificationAllowsSigning(reqs(null))).toBe(false);
    expect(verificationAllowsSigning(reqs("rejected"))).toBe(false);
  });
  it("still blocks wire instructions and funding until approved", () => {
    const r = reqs("review").map((x) => x.key === "signature" ? { ...x, state: "valid" as const } : x);
    expect(canInvestorFund({ stage: "approved_to_fund", requirements: r, approvedToFundAt: now, openBlockingExceptions: 0, countersignTiming: "parallel" }).allowed).toBe(false);
  });
});
