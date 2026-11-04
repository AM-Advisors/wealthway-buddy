import { describe, expect, it } from "vitest";
import type { RequirementResult } from "./investor-onboarding-model";
import { outsideSignedRequirements, subscriptionReadyForReview } from "./subscription-review-readiness";

const requirements = [
  { key: "investment_profile", state: "valid" }, { key: "identity_verification", state: "valid" },
  { key: "aml", state: "valid" }, { key: "accreditation", state: "valid" },
  { key: "tax_documentation", state: "valid" }, { key: "subscription_questionnaire", state: "missing" },
  { key: "certifications", state: "missing" }, { key: "subscription_documents", state: "missing" },
  { key: "signature", state: "missing" }, { key: "bad_actor", state: "missing" },
  { key: "bsa_aml", state: "missing" }, { key: "funding", state: "missing" },
] as RequirementResult[];
const signed = outsideSignedRequirements(requirements, { complete: true, signedOn: "2026-10-09" });
describe("outside subscription approval readiness", () => {
  it("completed outside signing can reach review from manual entry", () => {
    expect(subscriptionReadyForReview("profile_selected", signed, false, false, 0)).toBe(true);
  });
  it("a mark without a qualifying copy cannot complete signing", () => {
    expect(outsideSignedRequirements(requirements, { complete: false, signedOn: "2026-10-09" })).toEqual(requirements);
    expect(subscriptionReadyForReview("profile_selected", requirements, false, false, 0)).toBe(false);
  });
  it("does not complete funding", () => expect(signed.find(r => r.key === "funding")?.state).toBe("missing"));
  for (const key of ["identity_verification", "aml", "accreditation", "tax_documentation"] as const) {
    it(`keeps incomplete ${key} blocking approval`, () => {
      const incomplete = requirements.map(r => r.key === key ? { ...r, state: "review_required" as const } : r);
      expect(subscriptionReadyForReview("profile_selected", outsideSignedRequirements(incomplete, { complete: true, signedOn: "2026-10-09" }), false, false, 0)).toBe(false);
    });
  }
  it("keeps blocking exceptions protected", () => expect(subscriptionReadyForReview("signature", signed, false, false, 1)).toBe(false));
  for (const key of ["bad_actor", "bsa_aml", "certifications"] as const) {
    it(`outside paperwork does not clear an unresolved ${key} review`, () => {
      const flagged = requirements.map(r => r.key === key ? { ...r, state: "review_required" as const } : r);
      expect(subscriptionReadyForReview("profile_selected", outsideSignedRequirements(flagged, { complete: true, signedOn: "2026-10-09" }), false, false, 0)).toBe(false);
    });
  }
  it("never revives terminal or money-stage records", () => {
    for (const stage of ["declined", "cancelled", "closed", "funded", "accepted", "awaiting_funds", "unknown"]) expect(subscriptionReadyForReview(stage, signed, false, false, 0)).toBe(false);
  });
  it("never advances removed or already approved records", () => {
    expect(subscriptionReadyForReview("signature", signed, true, false, 0)).toBe(false);
    expect(subscriptionReadyForReview("signature", signed, false, true, 0)).toBe(false);
  });
});