import { describe, expect, it } from "vitest";
import { planProfileFill, type CurrentRecord } from "./investor-profile-fill-model";
import { normalizeReading, mergeInvestors } from "./investor-doc-extract-model";
import { pickInvestorFor } from "./fund-drive-intake-model";

const read = (x: Record<string, unknown>, keepBirthDate = true) => normalizeReading({ document_kind: "Subscription", notes: [], investors: [x] }, { keepBirthDate }).investors[0]!;
const cur = (p: Partial<CurrentRecord> = {}): CurrentRecord => ({
  person: { legal_first_name: "Jane", legal_last_name: "Doe" }, profile: { profile_type: "llc", legal_name: null, details: {} },
  investment: {}, relatedNames: [], claimed: false, editWindowOpen: true, ...p,
});
const fields = (items: { field: string }[]) => items.map((i) => i.field).sort();

describe("reading every investor detail", () => {
  it("keeps a birth date only when Harmonious reads the document, and never a future date", () => {
    expect(read({ first_name: "Jane", last_name: "Doe", date_of_birth: "1980-05-12" }).dateOfBirth).toBe("1980-05-12");
    expect(read({ first_name: "Jane", last_name: "Doe", date_of_birth: "1980-05-12" }, false).dateOfBirth).toBeNull();
    expect(read({ first_name: "Jane", last_name: "Doe", investment_date: "2999-01-01" }).investmentDate).toBeNull();
  });
  it("reads owners and signers, never repeating the investor, and combines them across documents", () => {
    const a = read({ first_name: "Jane", last_name: "Doe", entity_name: "Doe LLC", related_people: [
      { first_name: "Jane", last_name: "Doe", email: null, role: "authorized_signer", ownership_percent: null, is_signer: true },
      { first_name: "Sam", last_name: "Roe", email: null, role: "beneficial_owner", ownership_percent: "40%", is_signer: false },
    ] });
    expect(a.related).toEqual([{ firstName: "Sam", lastName: "Roe", email: null, role: "beneficial_owner", ownershipPercent: "40", isSigner: false }]);
    const b = read({ first_name: "Jane", last_name: "Doe", entity_name: "Doe LLC", city: "Austin", related_people: [
      { first_name: "Sam", last_name: "Roe", email: "sam@roe.com", role: "beneficial_owner", ownership_percent: null, is_signer: true },
      { first_name: "Ann", last_name: "Poe", email: null, role: "control_person", ownership_percent: null, is_signer: false },
    ] });
    const [m] = mergeInvestors([a, b]);
    expect(m!.city).toBe("Austin");
    expect(m!.related.map((r) => `${r.firstName} ${r.email ?? ""} ${r.isSigner}`)).toEqual(["Sam sam@roe.com true", "Ann  false"]);
  });
});

describe("completing an existing profile from documents", () => {
  const inv = read({ first_name: "Jane", last_name: "Doe", phone: "512-555-0100", address_line1: "1 Main St", city: "Austin", region: "TX", postal_code: "78701", country: "US",
    email: "jane@doe.com", citizenship: "United States", date_of_birth: "1980-05-12", entity_name: "Doe LLC", jurisdiction: "Delaware", amount: "250000",
    related_people: [{ first_name: "Sam", last_name: "Roe", email: null, role: "beneficial_owner", ownership_percent: "40", is_signer: false }] });

  it("fills blank contact, address, entity and amount details directly", () => {
    const plan = planProfileFill(cur(), inv);
    expect(fields(plan.fill)).toEqual(["address_line1", "city", "country", "legal_name", "phone", "postal_code", "region", "requested_amount_cents"].sort());
    expect(plan.fill.find((x) => x.field === "requested_amount_cents")!.value).toBe(25_000_000);
    expect(plan.details).toEqual({ jurisdiction: "Delaware" });
    expect(plan.related.map((r) => r.lastName)).toEqual(["Roe"]);
  });
  it("sends email, birth date and citizenship to review instead of filling them", () => {
    expect(fields(planProfileFill(cur(), inv).suggest)).toEqual(["citizenship_country", "date_of_birth", "email"]);
  });
  it("never overwrites a recorded value: a different phone or amount goes to review", () => {
    const plan = planProfileFill(cur({ person: { legal_first_name: "Jane", legal_last_name: "Doe", phone: "212-555-0199" }, investment: { requested_amount_cents: 10_000_000 } }), inv);
    expect(fields(plan.fill)).not.toContain("phone");
    expect(fields(plan.suggest)).toEqual(expect.arrayContaining(["phone", "requested_amount_cents"]));
  });
  it("does not mix addresses: with any address on file, the document's address goes to review", () => {
    const plan = planProfileFill(cur({ person: { legal_first_name: "Jane", legal_last_name: "Doe", city: "Dallas" } }), inv);
    expect(fields(plan.fill)).not.toContain("address_line1");
    expect(fields(plan.suggest)).toEqual(expect.arrayContaining(["address_line1", "city", "region"]));
  });
  it("only suggests, and adds no owners, once the investor has their own login or has signed", () => {
    for (const c of [cur({ claimed: true }), cur({ editWindowOpen: false })]) {
      const plan = planProfileFill(c, inv);
      expect(plan.fill).toEqual([]);
      expect(plan.related).toEqual([]);
      expect(plan.details).toEqual({});
      expect(fields(plan.suggest)).toContain("phone");
    }
  });
  it("adds owners only for entities, trusts and joint investors, skipping people already listed", () => {
    expect(planProfileFill(cur({ profile: { profile_type: "individual", legal_name: "Jane Doe", details: {} } }), inv).related).toEqual([]);
    expect(planProfileFill(cur({ relatedNames: [{ firstName: "sam", lastName: "ROE" }] }), inv).related).toEqual([]);
  });
});

describe("matching a folder's readings to the investor", () => {
  const jane = read({ first_name: "Jane", last_name: "Doe" }), sam = read({ first_name: "Sam", last_name: "Roe", entity_name: "Roe Family Trust" });
  it("picks the reading whose name matches, the only reading, or none", () => {
    expect(pickInvestorFor(["Roe Family Trust"], [jane, sam])).toBe(sam);
    expect(pickInvestorFor(["Someone Else"], [jane])).toBe(jane);
    expect(pickInvestorFor(["Someone Else"], [jane, sam])).toBeNull();
  });
});
