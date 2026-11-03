import { describe, expect, it } from "vitest";
import { shouldAdvanceVerifiedInvestor } from "./verification-auto-advance";
import { determineOnboardingRequirements } from "./investor-onboarding-model";

const requirements = () => determineOnboardingRequirements({
  offering: { kycRequired: true, kybRequired: true, amlRequired: true, accreditationRequired: false, taxDocumentRequired: true, subscriptionQuestionnaireRequired: true, minInvestmentCents: 10000000 },
  person: { personId: "person", kycStatus: "approved", amlStatus: "approved" },
  profile: { profileId: "profile", profileType: "individual" },
  subscription: { requestedAmountCents: 25000000, questionnaireComplete: false, documentsPrepared: false, signatureStatus: null, fundingStatus: "not_funded" },
  nowIso: "2026-11-03T20:34:00Z",
});
describe("automatic Verification to Sign", () => {
  it("advances approved Verification with unsigned documents and incomplete tax/questionnaire", () => {
    expect(shouldAdvanceVerifiedInvestor("verification", requirements(), false)).toBe(true);
  });
  for (const state of ["review_required", "refresh_required", "missing"] as const) it(`does not automatically advance ${state} verification`, () => {
    const rows = requirements().map(r => r.key === "identity_verification" ? { ...r, state } : r);
    expect(shouldAdvanceVerifiedInvestor("verification", rows, false)).toBe(false);
  });
  it("does not auto-approve unresolved screening even when signing is allowed", () => {
    const rows = requirements().map(r => r.key === "aml" ? { ...r, state: "review_required" as const, signingAllowed: true } : r);
    expect(shouldAdvanceVerifiedInvestor("verification", rows, false)).toBe(false);
  });
  it("preserves incomplete About You", () => {
    const rows = requirements().map(r => r.key === "investment_amount" ? { ...r, state: "missing" as const } : r);
    expect(shouldAdvanceVerifiedInvestor("verification", rows, false)).toBe(false);
  });
  for (const stage of ["profile_selected", "signature", "funding", "closed", "declined", "cancelled"]) it(`never changes ${stage}`, () => {
    expect(shouldAdvanceVerifiedInvestor(stage, requirements(), false)).toBe(false);
  });
  it("preserves removed investments", () => expect(shouldAdvanceVerifiedInvestor("verification", requirements(), true)).toBe(false));
});