import { describe, expect, it } from "vitest";
import { approvalEffects, approvalError, companyApprovalEffects, countryCode, entryProblems, planBulkRow, screeningFromResponse, sensitiveSummary, type AmlEntry, type KybEntry, type KycEntry, type ScreeningResult } from "./staff-verification-model";

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
    expect(approvalEffects({ kyc, aml }, { kyc_status: "not_started", aml_status: "not_started", date_of_birth: null })).toEqual({ kyc: true, aml: true, fillDateOfBirth: "1980-02-03", fillPerson: {} });
    expect(approvalEffects({ kyc: null, aml: { ...aml, result: "confirmed_match" } }, { kyc_status: "approved", aml_status: "not_started", date_of_birth: "1980-02-03" })).toEqual({ kyc: false, aml: false, fillDateOfBirth: null, fillPerson: {} });
  });
});

const kyb: KybEntry = { legalName: "Example Holdings LLC", entityType: "LLC", formationJurisdiction: "Texas", formationDate: "2019-05-01", method: "state_registry", verifiedOn: "2026-11-10", ownersChecked: "Avery Fictional Tester, 100% owner" };
const screen = (status: ScreeningResult["status"]): ScreeningResult => ({ requestId: "r1", status, totalHits: status === "approved" ? 0 : 1, score: null, hits: [], screenedOn: "2026-11-10", screenedName: "Avery Fictional Tester", entityType: "person" });

describe("fresh screening", () => {
  it("can't be combined with a past screening", () => expect(entryProblems({ kyc, aml, runScreening: true, sourceReference: "x123" }, "2026-11-10")).toContain("Choose either a past screening or a fresh one, not both."));
  it("counts on its own as a check", () => expect(entryProblems({ kyc: null, aml: null, runScreening: true, sourceReference: "x123" }, "2026-11-10")).toEqual([]));
  it("refuses approval when it found a high-risk match", () => expect(approvalError({ ...base, entry: { ...base.entry, aml: null, screening: screen("declined") } })).toMatch(/high-risk/));
  it("needs a note when it found possible matches", () => {
    expect(approvalError({ ...base, entry: { ...base.entry, aml: null, screening: screen("review") } })).toMatch(/possible matches/);
    expect(approvalError({ ...base, note: "Different birth year, ruled out", entry: { ...base.entry, aml: null, screening: screen("review") } })).toBeNull();
  });
  it("approves AML from a clean fresh screening", () => expect(approvalEffects({ kyc: null, aml: null, screening: screen("approved") }, { kyc_status: "not_started", aml_status: "not_started", date_of_birth: null }).aml).toBe(true));
  it("maps the provider answer", () => {
    const r = screeningFromResponse({ request_id: "abc", aml: { status: "In Review", total_hits: 1, score: 85, hits: [{ caption: "A Person", datasets: ["PEP"], match_score: 95, risk_score: 85, review_status: "Unreviewed" }] } }, { today: "2026-11-10", name: "A Person", entityType: "person" });
    expect(r).toMatchObject({ requestId: "abc", status: "review", totalHits: 1, hits: [{ caption: "A Person", matchScore: 95, riskScore: 85 }] });
  });
  it("finds the citizenship country code", () => { expect(countryCode("United States")).toBe("US"); expect(countryCode("Canada")).toBe("CA"); expect(countryCode("Atlantis")).toBeNull(); });
});

describe("sensitive numbers", () => {
  it("requires 9-digit SSNs and EINs", () => {
    expect(entryProblems({ kyc, aml: null, ssn: "123-45-678", sourceReference: "x123" }, "2026-11-10")).toContain("The Social Security number must be 9 digits.");
    expect(entryProblems({ subject: "company", kyc: null, kyb, aml: null, ein: "12-34567", sourceReference: "x123" }, "2026-11-10")).toContain("The EIN must be 9 digits.");
  });
  it("checks the full ID number against the last 4", () => expect(entryProblems({ kyc, aml: null, idNumber: "D999ZZZZ", sourceReference: "x123" }, "2026-11-10")).toContain("The last 4 of the ID number don't match the full ID number."));
  it("keeps only the last 4 for display", () => expect(sensitiveSummary({ idNumber: "d12-3a1b2", ssn: "123-45-6789", ein: null })).toEqual({ idNumberLast4: "A1B2", ssnLast4: "6789" }));
});

describe("companies", () => {
  it("accepts a business check with screening", () => expect(entryProblems({ subject: "company", kyc: null, kyb, aml, sourceReference: "Registry printout" }, "2026-11-10")).toEqual([]));
  it("keeps personal ID checks off companies", () => expect(entryProblems({ subject: "company", kyc, kyb, aml: null, sourceReference: "x123" }, "2026-11-10")).toContain("Choose the company's owners as people to record their ID checks."));
  it("needs the owners that were checked", () => expect(entryProblems({ subject: "company", kyc: null, kyb: { ...kyb, ownersChecked: "" }, aml: null, sourceReference: "x123" }, "2026-11-10")).toContain("Say which owners and controllers were checked."));
  it("needs a note when the company name differs", () => expect(approvalError({ ...base, personDateOfBirth: null, personLegalName: "Other Name LLC", entry: { entered_by: "maker", status: "review", kyc: null, aml, kyb } })).toMatch(/company name differs/));
  it("approves KYB and AML and fills only blanks", () => {
    const fx = companyApprovalEffects({ kyb, aml, details: { addressLine1: "1 Main", city: "Dallas" } }, { kyb_status: "not_started", entity_aml_status: "not_started", legal_name: "Kept Name LLC", entity_type: null });
    expect(fx).toEqual({ kyb: true, aml: true, fillEntity: { entity_type: "LLC", formation_jurisdiction: "Texas", formation_date: "2019-05-01", address_line1: "1 Main", city: "Dallas" } });
  });
});

describe("filling person details", () => {
  it("never overwrites saved values and fills the address only as a whole", () => {
    const fx = approvalEffects({ kyc: null, aml, details: { addressLine1: "9 New Rd", city: "Austin", phone: "214-555-0100", citizenship: "United States" } },
      { kyc_status: "approved", aml_status: "not_started", date_of_birth: null, city: "Dallas", phone: null, citizenship_country: "Canada" });
    expect(fx.fillPerson).toEqual({ phone: "214-555-0100" });
  });
});

describe("spreadsheet rows", () => {
  it("plans a person row found by email with a fresh screening", () => {
    const p = planBulkRow({ type: "person", email: "Avery@Example.com", legal_name: "Avery Fictional Tester", date_of_birth: "2/3/1980", id_type: "passport", id_number: "X1234A1B2", id_expires: "2032-06-14", id_verified_on: "2026-11-01", screening: "run", source_reference: "Prior case 1" }, 2, "2026-11-10");
    expect(p.problems).toEqual([]);
    expect(p.match).toEqual({ kind: "person", email: "avery@example.com" });
    expect(p.input.kyc).toMatchObject({ dateOfBirth: "1980-02-03", idType: "passport", idLast4: "A1B2" });
    expect(p.input.runScreening).toBe(true);
  });
  it("reports a row without an email", () => expect(planBulkRow({ legal_name: "No Email", source_reference: "x123", screening: "run" }, 3, "2026-11-10").problems).toContain("Add the person's email so we can find their record."));
  it("plans a company row by name", () => {
    const p = planBulkRow({ type: "company", company_name: "Example Holdings LLC", kyb_verified_on: "2026-11-01", owners_checked: "Avery, 100%", screening: "past", aml_screened_on: "2026-11-01", source_reference: "Registry" }, 4, "2026-11-10");
    expect(p.problems).toEqual([]);
    expect(p.match).toEqual({ kind: "company", companyName: "Example Holdings LLC" });
    expect(p.input.kyb?.legalName).toBe("Example Holdings LLC");
  });
  it("flags unknown choices", () => expect(planBulkRow({ email: "a@b.co", id_last4: "1234", id_type: "library card", legal_name: "A B", date_of_birth: "1980-01-01", id_expires: "2030-01-01", source_reference: "x123" }, 5, "2026-11-10").problems).toContain('ID type "library card" isn\'t recognized.'));
});
