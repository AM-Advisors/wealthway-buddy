import { describe, expect, it } from "vitest";
import { determineOnboardingRequirements } from "@/lib/investor-onboarding-model";
import { kycNeverSubmitted } from "@/lib/investor-onboarding.server";

const offering = { accreditationRequired: false, kycRequired: true, kybRequired: false, amlRequired: false, taxDocumentRequired: false, subscriptionQuestionnaireRequired: false };
const identity = (person: any) =>
  determineOnboardingRequirements({ offering, person: { personId: "p", ...person }, profile: { profileId: "x", profileType: "individual" }, subscription: {}, nowIso: "2026-10-21T00:00:00Z" })
    .find((r) => r.key === "identity_verification")!.state;

describe("unfinished identity checks", () => {
  it("a review status with nothing ever submitted lets the investor start again", () => {
    expect(identity({ kycStatus: "review", kycUnfinished: true })).toBe("missing");
  });
  it("a submitted check in review stays in review", () => {
    expect(identity({ kycStatus: "review", kycUnfinished: false })).toBe("review_required");
  });
  it("detects sessions that were never submitted", () => {
    expect(kycNeverSubmitted([{ liveness_status: "not_started", face_match_status: "not_started" }])).toBe(true);
    expect(kycNeverSubmitted([{ liveness_status: "approved" }])).toBe(false);
    expect(kycNeverSubmitted([])).toBe(false);
  });
});
