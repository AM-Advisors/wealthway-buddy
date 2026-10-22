import { describe, expect, it } from "vitest";
import { canCloseInvestment, canInvestorFund, determineOnboardingRequirements, verificationAllowsSigning } from "./investor-onboarding-model";
import { journeySteps, nextJourneyStep } from "./investor-journey-model";

const now = "2026-10-22T20:37:00Z";
const requirements = (kycStatus = "approved", amlStatus = "pending") => determineOnboardingRequirements({
  offering: { accreditationRequired: false, kycRequired: true, kybRequired: true, amlRequired: true, taxDocumentRequired: false, subscriptionQuestionnaireRequired: false },
  person: { personId: "jane-doe", kycStatus, amlStatus },
  profile: { profileId: "jane-profile", profileType: "individual" },
  subscription: { requestedAmountCents: 10000, documentsPrepared: true }, nowIso: now,
});

describe("approved identity with pending AML: sign only", () => {
  it("allows signing with approved identity and explicit pending AML", () => {
    expect(verificationAllowsSigning(requirements())).toBe(true);
    expect(requirements().find((r) => r.key === "aml")?.state).toBe("review_required");
  });
  it.each(["pending", "review", "failed", "declined", "not_started"])("does not allow %s identity to sign", (identity) => {
    expect(verificationAllowsSigning(requirements(identity))).toBe(false);
  });
  it.each(["failed", "declined", "rejected", "review", "not_started", "unknown"])("does not allow %s AML to sign", (aml) => {
    expect(verificationAllowsSigning(requirements("approved", aml))).toBe(false);
  });
  it("allows normal approved screening to sign", () => {
    expect(verificationAllowsSigning(requirements("approved", "approved"))).toBe(true);
  });
  it("opens Sign and resumes there without completing Verification or opening Fund", () => {
    const steps = journeySteps(requirements(), { stage: "verification", approvedToFund: true, fundingStatus: null, investorReportsSent: false });
    expect(steps.find((s) => s.key === "verify")?.state).toBe("in_progress");
    expect(steps.find((s) => s.key === "sign")?.state).toBe("action_required");
    expect(steps.find((s) => s.key === "fund")?.state).toBe("locked");
    expect(nextJourneyStep(steps)).toBe("sign");
  });
  it.each(["pause", "parallel", "after_completion"] as const)("blocks wire/funding with pending AML under %s timing", (countersignTiming) => {
    expect(canInvestorFund({ stage: "approved_to_fund", requirements: requirements().map((r) => r.key === "signature" ? { ...r, state: "valid" as const } : r), approvedToFundAt: now, openBlockingExceptions: 0, countersignTiming }).allowed).toBe(false);
  });
  it("blocks final admission even with manager approval, signature, reconciled funds and acceptance", () => {
    expect(canCloseInvestment({ stage: "accepted", requirements: requirements().map((r) => r.key === "signature" ? { ...r, state: "valid" as const } : r), approvedToFundAt: now, openBlockingExceptions: 0, fundingStatus: "funded", fundingReconciled: true, acceptedAt: now, acceptedAmountCents: 10000 }).allowed).toBe(false);
  });
});