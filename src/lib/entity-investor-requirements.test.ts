import { describe, expect, it } from "vitest";
import { entityRequirements, missingPersonFields, needsFullDetails } from "./entity-investor-requirements";

const person = (o: Partial<Parameters<typeof missingPersonFields>[0]> = {}) => ({ id: "p1", name: "Kim Girardi", role: "beneficial_owner", ownershipPercent: 50, signer: true, email: "k@x.com", dobOnFile: true, ssnOnFile: true, taxFormSigner: true, ...o });

describe("entity investor requirements", () => {
  it("a trust with an SSN on file does not require a separate EIN", () => {
    const r = entityRequirements({ legalName: "Family Trust", trust: true, taxIdType: "ssn", einOnFile: true, responsiblePartyId: "p1", people: [person({ role: "trustee" })] });
    expect(r.find((i) => i.key === "ein")?.done).toBe(true);
    expect(r.every((i) => i.done)).toBe(true);
  });
  it("owners under 25% do not need full details", () => {
    expect(needsFullDetails({ role: "beneficial_owner", ownershipPercent: 10, signer: false })).toBe(false);
    expect(needsFullDetails({ role: "beneficial_owner", ownershipPercent: 25, signer: false })).toBe(true);
  });
  it("signers need email, date of birth and SSN", () => {
    expect(missingPersonFields(person({ email: null, dobOnFile: false, ssnOnFile: false }))).toEqual(["email", "date of birth", "SSN"]);
  });
  it("W-9 signer must be one of the signers", () => {
    const r = entityRequirements({ legalName: "Trust", einOnFile: true, responsiblePartyId: "p1", people: [person({ signer: false, taxFormSigner: true, role: "trustee" })] });
    expect(r.find((i) => i.key === "w9_signer")?.done).toBe(false);
  });
  it("complete record has nothing missing", () => {
    const r = entityRequirements({ legalName: "Trust", einOnFile: true, responsiblePartyId: "p1", people: [person({ role: "trustee" })] });
    expect(r.every((i) => i.done)).toBe(true);
  });
  it("EIN and responsible party are required", () => {
    const r = entityRequirements({ legalName: "Trust", einOnFile: false, responsiblePartyId: null, people: [person({ role: "trustee" })] });
    expect(r.filter((i) => !i.done).map((i) => i.key)).toEqual(["ein", "responsible_party"]);
  });
});

describe("trustee open items are listed", () => {
  it("counts a trustee's missing SSN as an open, person-specific item", async () => {
    const { entityRequirements } = await import("./entity-investor-requirements");
    const items = entityRequirements({ legalName: "Girardi Trust", trust: true, taxIdType: "ein", einOnFile: true, responsiblePartyId: "j", people: [
      { id: "j", name: "Joe", role: "trustee", ownershipPercent: 50, signer: true, email: "j@x.com", dobOnFile: true, ssnOnFile: true, taxFormSigner: true },
      { id: "k", name: "Kim", role: "beneficial_owner", ownershipPercent: 50, signer: true, email: "k@x.com", dobOnFile: true, ssnOnFile: false },
    ] });
    const open = items.filter((i) => !i.done);
    expect(open.map((i) => i.label)).toEqual(["Kim: add SSN"]);
    expect(open[0]?.personId).toBe("k");
  });
});
