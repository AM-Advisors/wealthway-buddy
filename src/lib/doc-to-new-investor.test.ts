import { describe, it, expect } from "vitest";
import { draftFromDocument, partyKey, draftProblems } from "./doc-to-new-investor";
describe("draftFromDocument", () => {
  it("maps person fields and lowercases email", () => {
    const d = draftFromDocument({ first_name: "Jane", last_name: "Doe", email: " Jane@X.com " }, []);
    expect([d.type, d.firstName, d.lastName, d.email]).toEqual(["individual", "Jane", "Doe", "jane@x.com"]);
  });
  it("detects a trust and splits the signer name", () => {
    const d = draftFromDocument({}, [{ name: "Doe Family Trust", role: "entity" }, { name: "John Q Doe", role: "signer" }]);
    expect([d.type, d.legalName, d.firstName, d.lastName]).toEqual(["trust", "Doe Family Trust", "John", "Q Doe"]);
  });
  it("never carries tax or account numbers", () => {
    const d = draftFromDocument({ first_name: "A", last_name: "B", ssn: "123456789", ein: "1", account_number: "9" } as any, []);
    expect(JSON.stringify(d)).not.toMatch(/123456789/);
  });
  it("groups files for the same person", () => {
    expect(partyKey({ email: "", firstName: "Jane", lastName: "Doe", legalName: "" })).toBe(partyKey({ email: "", firstName: "jane", lastName: "DOE", legalName: "" }));
  });
  it("requires a name", () => { expect(draftProblems(draftFromDocument({}, [])).length).toBeGreaterThan(0); });
});
