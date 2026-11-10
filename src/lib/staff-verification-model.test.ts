import { describe, expect, it } from "vitest";
import { approvalEffects, approvalError, entryProblems, type AmlEntry, type KycEntry } from "./staff-verification-model";

const kyc: KycEntry = { legalName: "Avery Fictional Tester", dateOfBirth: "1980-02-03", idType: "drivers_license", issuingCountry: "United States", issuingRegion: "TX", idLast4: "A1B2", idExpires: "2032-06-14", method: "other_provider", verifiedOn: "2026-11-10", selfie: "passed" };
const aml: AmlEntry = { screenedOn: "2026-11-10", listsChecked: "OFAC SDN", result: "no_matches" };
const base = { entry: { entered_by: "maker", status: "review", kyc, aml }, deciderId: "checker", deciderIsSuperAdmin: false, subjectUserId: "subject", note: null, personDateOfBirth: "1980-02-03", personLegalName: "Avery Fictional Tester", today: "2026-11-10" };

describe("entering details", () => {
  it("accepts a complete entry", () => expect(entryProblems({ kyc, aml, sourceReference: "Provider case 123" }, "2026-11-10")).toEqual([]));
  it("requires identity or screening", () => expect(entryProblems({ kyc: null, aml: null, sourceReference: "x123" }, "2026-11-10")).toContain("Enter identity details, screening details, or both."));
  it("rejects an ID that was expired when checked", () => expect(entryProblems({ kyc: { ...kyc, idExpires: "2026-01-01" }, aml: null, sourceReference: "x123" }, "2026-11-10")).toContain("The ID was expired when it was checked."));
  it("requires an explanation for ruled-out matches", () => expect(entryProblems({ kyc: null, aml: { ...aml, result: "matches_ruled_out" }, sourceReference: "x123" }, "2026-11-10")).toContain("Explain why each possible match was ruled out."));
});

describe("approving details", () => {
  it("lets a different reviewer approve", () => expect(approvalError(base)).toBeNull());
  it("blocks the person who entered them", () => expect(approvalError({ ...base, deciderId: "maker" })).toMatch(/Someone other than/));
  it("lets a Super Admin approve their own entry only with a reason", () => {
    expect(approvalError({ ...base, deciderId: "maker", deciderIsSuperAdmin: true })).toMatch(/reason/);
    expect(approvalError({ ...base, deciderId: "maker", deciderIsSuperAdmin: true, note: "Reviewed the provider report" })).toBeNull();
  });
  it("never lets anyone approve themselves", () => expect(approvalError({ ...base, subjectUserId: "checker" })).toMatch(/your own/));
  it("refuses a confirmed watchlist match", () => expect(approvalError({ ...base, entry: { ...base.entry, aml: { ...aml, result: "confirmed_match" } } })).toMatch(/confirmed watchlist match/));
  it("refuses a date of birth that differs from the record", () => expect(approvalError({ ...base, personDateOfBirth: "1990-01-01" })).toMatch(/date of birth/));
  it("needs a note when no selfie was done", () => expect(approvalError({ ...base, entry: { ...base.entry, kyc: { ...kyc, selfie: "not_performed" } } })).toMatch(/selfie/));
  it("only moves statuses to approved and fills a blank birthday", () => {
    expect(approvalEffects({ kyc, aml }, { kyc_status: "not_started", aml_status: "not_started", date_of_birth: null })).toEqual({ kyc: true, aml: true, fillDateOfBirth: "1980-02-03" });
    expect(approvalEffects({ kyc: null, aml: { ...aml, result: "confirmed_match" } }, { kyc_status: "approved", aml_status: "not_started", date_of_birth: "1980-02-03" })).toEqual({ kyc: false, aml: false, fillDateOfBirth: null });
  });
});
