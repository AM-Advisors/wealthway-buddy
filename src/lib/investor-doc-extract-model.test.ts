import { describe, expect, it } from "vitest";
import { fillBlankFormFields, investorsToBulkCsv, mergeInvestors, normalizeReading, redactNumbers } from "./investor-doc-extract-model";

const base = { first_name: null, middle_name: null, last_name: null, email: null, phone: null, investor_type: null, entity_name: null, address_line1: null, address_line2: null, city: null, region: null, postal_code: null, country: null, citizenship: null, amount: null };

describe("investor document reading", () => {
  it("never keeps tax ID or account numbers, even if the AI returns them", () => {
    const r = normalizeReading({ document_kind: "W-9", notes: ["SSN 123-45-6789 shown"], investors: [{ ...base, first_name: "Jane", last_name: "Doe", address_line1: "EIN 12-3456789", entity_name: "Acct 123456789012" }] });
    expect(r.investors[0]!.addressLine1).toBeNull();
    expect(r.investors[0]!.entityName).toBeNull();
    expect(r.notes).toEqual([]);
    expect(redactNumbers("123456789")).toBe("[removed]");
  });
  it("keeps zip+4 postal codes and cleans amounts", () => {
    const r = normalizeReading({ document_kind: "Subscription", notes: [], investors: [{ ...base, first_name: "Jo", last_name: "Lee", postal_code: "80202-1234", amount: "$250,000.00", email: " JO@Example.com " }] });
    expect(r.investors[0]).toMatchObject({ postalCode: "80202-1234", amount: "250000", email: "jo@example.com" });
  });
  it("combines documents about the same investor, earlier values win", () => {
    const m = mergeInvestors([
      { ...normalizeReading({ document_kind: "", notes: [], investors: [{ ...base, first_name: "Jo", last_name: "Lee", city: "Denver" }] }).investors[0]! },
      { ...normalizeReading({ document_kind: "", notes: [], investors: [{ ...base, first_name: "Jo", last_name: "Lee", city: "Austin", amount: "1000" }] }).investors[0]! },
    ]);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ city: "Denver", amount: "1000" });
  });
  it("fills only blank boxes so typed values stay", () => {
    const inv = normalizeReading({ document_kind: "", notes: [], investors: [{ ...base, first_name: "Jane", last_name: "Doe", email: "jane@doe.com", investor_type: "trust" }] }).investors[0]!;
    const r = fillBlankFormFields({ firstName: "Janet", profileType: "individual" }, inv, { profileTouched: true });
    expect(r.form).toMatchObject({ firstName: "Janet", lastName: "Doe", email: "jane@doe.com", profileType: "individual" });
  });
  it("builds rows for the existing bulk preview", () => {
    const inv = normalizeReading({ document_kind: "", notes: [], investors: [{ ...base, first_name: "Jane", last_name: "Doe", investor_type: "entity", entity_name: "Doe, LLC", city: "Denver", region: "CO" }] }).investors[0]!;
    expect(investorsToBulkCsv([inv]).split("\n")[1]).toBe('Jane,Doe,,entity,,,,"Doe, LLC","Denver, CO"');
  });
});
