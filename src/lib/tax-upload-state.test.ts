import { describe, expect, it } from "vitest";
import { pendingTaxUpload, taxStateWithUpload, type TaxUpload } from "./tax-upload-state";

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
});