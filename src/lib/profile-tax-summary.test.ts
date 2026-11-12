import { describe, expect, it } from "vitest";
import { profileTaxSummary, submittedFields } from "./profile-tax-summary";

const ind = { id: "p1", profile_type: "individual", tax_id_last4: "9563", tax_id_type: "ssn" };

describe("profile tax summary", () => {
  it("shows the identifier from the person's own individual profile when the person has none", () => {
    const t = profileTaxSummary({ person: { tax_id_last4: null, tax_id_on_file: false }, profiles: [ind], taxProfiles: [], taxForms: [] });
    expect(t.identifierOnFile).toBe(true);
    expect(t.identifierLast4).toBe("9563");
    expect(t.identifierType).toBe("ssn");
    expect(t.identifierSource).toBe("individual_profile");
  });

  it("prefers the person's own record", () => {
    const t = profileTaxSummary({ person: { tax_id_last4: "1111", tax_id_on_file: true, tax_residency_country: "US" }, profiles: [ind], taxProfiles: [{ investment_profile_id: "p1", tax_residency_country: "CA" }], taxForms: [] });
    expect(t.identifierLast4).toBe("1111");
    expect(t.residency).toBe("US");
    expect(t.residencySource).toBe("person");
  });

  it("never reads an entity profile's tax number or residency as the person's", () => {
    const trust = { id: "t1", profile_type: "trust", tax_id_last4: "7777", tax_id_type: "ein" };
    const t = profileTaxSummary({ person: null, profiles: [trust], taxProfiles: [{ investment_profile_id: "t1", tax_residency_country: "US" }], taxForms: [{ investment_profile_id: "t1", review_status: "completed_outside" }] });
    expect(t.identifierOnFile).toBe(false);
    expect(t.residency).toBeNull();
    expect(t.taxForm).toBeNull();
  });

  it("does not infer residency from a tax form", () => {
    const t = profileTaxSummary({ person: null, profiles: [ind], taxProfiles: [], taxForms: [{ investment_profile_id: "p1", review_status: "completed_outside" }] });
    expect(t.residency).toBeNull();
    expect(t.taxForm).toBe("completed_outside");
  });

  it("shows an uploaded but unreviewed form as review pending, and ignores rejected forms", () => {
    expect(profileTaxSummary({ person: null, profiles: [ind], taxProfiles: [], taxForms: [{ investment_profile_id: "p1", review_status: "new" }] }).taxForm).toBe("review_pending");
    expect(profileTaxSummary({ person: null, profiles: [ind], taxProfiles: [], taxForms: [{ investment_profile_id: "p1", review_status: "rejected" }] }).taxForm).toBeNull();
  });
});

describe("saving personal details", () => {
  it("keeps fields the form did not send", () => {
    const out = submittedFields({ phone: " 555 ", city: "", date_of_birth: undefined, tax_residency_country: undefined } as Record<string, string | undefined>, ["phone", "city", "date_of_birth", "tax_residency_country"]);
    expect(out).toEqual({ phone: "555", city: null });
    expect("date_of_birth" in out).toBe(false);
    expect("tax_residency_country" in out).toBe(false);
  });
});
