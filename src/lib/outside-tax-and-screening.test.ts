import { describe, expect, it } from "vitest";
import { canCompleteTaxOutside } from "./investor-upload-review.server";
import { taxStateWithUpload } from "./tax-upload-state";
import { autoScreeningDecision } from "./aml-match-model";

const base = { isStaff: false, managesFund: true, actorId: "mgr", investorUserId: "inv", docKind: "tax_form", status: "accepted" };
describe("outside-signed W-9", () => {
  it("lets that fund's manager mark it completed", () => expect(canCompleteTaxOutside(base).ok).toBe(true));
  it("lets Harmonious staff mark it completed", () => expect(canCompleteTaxOutside({ ...base, isStaff: true, managesFund: false }).ok).toBe(true));
  it("blocks a manager of another fund", () => expect(canCompleteTaxOutside({ ...base, managesFund: false }).ok).toBe(false));
  it("blocks completing your own tax form", () => expect(canCompleteTaxOutside({ ...base, actorId: "inv" }).ok).toBe(false));
  it("counts as a completed tax form", () => expect(taxStateWithUpload({ state: "missing" }, { id: "w", onboarding_id: "o", investment_profile_id: "p", user_id: "inv", doc_kind: "tax_form", review_status: "completed_outside", file_name: "w9.pdf" }).state).toBe("valid"));
});
const person = { fullName: "Doug", dateOfBirth: "1970-05-01", country: "US" };
const hit = (o: any = {}) => ({ caption: "D M", datasets: [], countries: ["US"], birthDates: ["1950"], matchScore: 0.5, pep: false, lists: [], summary: null, ...o });
describe("automatic screening", () => {
  it("clears when there are no matches", () => expect(autoScreeningDecision({ completed: true, person, hits: [] })).toBe("auto_clear"));
  it("clears when every match has a different birth year", () => expect(autoScreeningDecision({ completed: true, person, hits: [hit()] })).toBe("auto_clear"));
  it("sends same-birth-year matches to review", () => expect(autoScreeningDecision({ completed: true, person, hits: [hit({ birthDates: ["1970"] })] })).toBe("review"));
  it("sends politically exposed matches to review", () => expect(autoScreeningDecision({ completed: true, person, hits: [hit({ pep: true })] })).toBe("review"));
  it("never clears an incomplete screening", () => expect(autoScreeningDecision({ completed: false, person, hits: [] })).toBe("review"));
});
