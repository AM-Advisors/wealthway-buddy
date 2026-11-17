import { describe, expect, it } from "vitest";
import { pendingTaxUpload, taxStateWithUpload, type TaxUpload } from "./tax-upload-state";
import { determineOnboardingRequirements } from "./investor-onboarding-model";
import { computeReadiness } from "./investment-readiness";

const investment = { id: "doug-investment", investment_profile_id: "doug-profile", investor_user_id: "doug" };
const copy: TaxUpload = { id: "w9", onboarding_id: investment.id, investment_profile_id: investment.investment_profile_id, user_id: "doug", doc_kind: "tax_form", review_status: "accepted", file_name: "signed-w9.pdf" };
describe("uploaded tax-form handoff", () => {
  it("accepted signed copy waits for certification review, never becomes complete", () => {
    expect(taxStateWithUpload({ state: "missing" }, pendingTaxUpload([copy], investment)).state).toBe("review_required");
  });
  it("another investing profile's file cannot change Doug's tax requirement", () => {
    expect(pendingTaxUpload([{ ...copy, investment_profile_id: "other-profile" }], investment)).toBeNull();
  });
  it("another investor's file cannot change Doug's tax requirement", () => {
    expect(pendingTaxUpload([{ ...copy, user_id: "other-investor" }], investment)).toBeNull();
  });
  it("another fund investment's file cannot change Doug's tax requirement", () => {
    expect(pendingTaxUpload([{ ...copy, onboarding_id: "other-investment" }], investment)).toBeNull();
  });
  it("a copy sent back does not stop the investor from correcting the form", () => {
    expect(pendingTaxUpload([{ ...copy, review_status: "needs_followup" }], investment)).toBeNull();
  });
  it("a valid certified form still wins over uploaded copies", () => {
    expect(taxStateWithUpload({ state: "valid" }, copy).state).toBe("valid");
  });
  it("an expired certified form still requires renewal", () => {
    expect(taxStateWithUpload({ state: "refresh_required" }, copy).state).toBe("refresh_required");
  });
  it("an accepted copy remains a blocker owned by Harmonious, not a new investor submission", () => {
    const requirements = determineOnboardingRequirements({
      offering: { accreditationRequired: false, kycRequired: true, kybRequired: false, amlRequired: true, taxDocumentRequired: true, subscriptionQuestionnaireRequired: false },
      person: { personId: "person", kycStatus: "approved", amlStatus: "clear" },
      profile: { profileId: investment.investment_profile_id, profileType: "individual", relatedPeople: [] },
      subscription: { requestedAmountCents: 5_000_000, documentsPrepared: true, signatureStatus: "completed" },
      compliance: { tax: taxStateWithUpload({ state: "missing" as const }, copy) },
      nowIso: "2026-10-29T23:54:00Z",
    });
    const result = computeReadiness({ requirements, stage: "harmonious_review", fundingStatus: "not_funded", approvedToFundAt: null, acceptedAt: null, acceptedAmountCents: null, closedAt: null, exceptions: [] });
    expect(result.items.find((item) => item.key === "tax_documentation")).toMatchObject({ status: "under_review", owner: "harmonious", blocking: true });
    expect(result.items.find((item) => item.key === "approved_to_fund")?.status).toBe("not_started");
    expect(result.closeReady).toBe(false);
  });
  it("a W-9 Harmonious uploaded for an investor with no login counts for that investment", () => {
    const manual = { id: "knutz-investment", investment_profile_id: "knutz-profile", investor_user_id: null, person_id: "knutz-person" };
    const staffCopy: TaxUpload = { ...copy, onboarding_id: manual.id, investment_profile_id: manual.investment_profile_id, user_id: "staff-uploader", prepared_for_person_id: "knutz-person" };
    expect(taxStateWithUpload({ state: "missing" }, pendingTaxUpload([staffCopy], manual)).state).toBe("review_required");
    expect(taxStateWithUpload({ state: "missing" }, pendingTaxUpload([{ ...staffCopy, review_status: "completed_outside" }], manual)).state).toBe("valid");
  });
  it("a no-login copy prepared for another person does not count", () => {
    const manual = { id: "knutz-investment", investment_profile_id: "knutz-profile", investor_user_id: null, person_id: "knutz-person" };
    expect(pendingTaxUpload([{ ...copy, onboarding_id: manual.id, investment_profile_id: manual.investment_profile_id, user_id: "staff-uploader", prepared_for_person_id: "someone-else" }], manual)).toBeNull();
  });
});

describe("tax classification from an uploaded tax form", () => {
  const up = (review_status: string) => ({ id: "u", onboarding_id: "o", investment_profile_id: "p", user_id: null, doc_kind: "tax_form", review_status, file_name: "w9.pdf" });
  it("is satisfied once the upload is recorded as completed outside the platform", async () => {
    const { classificationWithUpload } = await import("./tax-upload-state");
    expect(classificationWithUpload({ state: "missing" }, up("completed_outside")).state).toBe("valid");
  });
  it("is never satisfied by an unconfirmed copy", async () => {
    const { classificationWithUpload } = await import("./tax-upload-state");
    expect(classificationWithUpload({ state: "missing" }, up("accepted")).state).toBe("missing");
    expect(classificationWithUpload({ state: "missing" }, null).state).toBe("missing");
  });
});
