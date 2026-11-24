import { describe, expect, it } from "vitest";
import { summarizeFundAccess } from "./fund-access";
import { canOpenInvestorPerspective, completionActor, perspectiveStepFor } from "./investor-perspective";

const access = (changes: Partial<Parameters<typeof summarizeFundAccess>[0]> = {}) => summarizeFundAccess({ staff: false, manager: false, clientMember: false, teamRole: null, teamSource: null, ...changes });
describe("exact-fund investor inspection", () => {
  it("opens for the exact fund manager", () => expect(canOpenInvestorPerspective(access({ manager: true }))).toBe(true));
  it("opens for a live authorized team viewer", () => expect(canOpenInvestorPerspective(access({ teamRole: "fund_viewer", teamSource: "grant" }))).toBe(true));
  it("does not open from client membership alone", () => expect(canOpenInvestorPerspective(access({ clientMember: true }))).toBe(false));
  it("does not open for a removed team grant or a different fund", () => expect(canOpenInvestorPerspective(access())).toBe(false));
  it("keeps financial background and certification in Sign", () => { expect(perspectiveStepFor("bsa_aml")).toBe("sign"); expect(perspectiveStepFor("certifications")).toBe("sign"); });
  it("labels system activity as system even when a triggering staff account exists", () => expect(completionActor("system", "Triggering staff")).toBe("System"));
  it("never infers system completion from a missing actor", () => expect(completionActor(null, null)).toBe("Not recorded"));
});
import { perspectiveEditor, perspectiveMissingFields, INVESTOR_ONLY_KEYS } from "./investor-perspective";
describe("client perspective editing", () => {
  const base = { staff: false, manager: false, canView: true, teamRole: "viewer" } as any;
  it("view-only fund team cannot edit", () => expect(perspectiveEditor(base, false)).toBeNull());
  it("team with investor permission can edit", () => expect(perspectiveEditor(base, true)).toBe("team"));
  it("fund manager can edit", () => expect(perspectiveEditor({ ...base, manager: true }, false)).toBe("manager"));
  it("investor-only items never get inputs", () => { expect(INVESTOR_ONLY_KEYS.has("certifications")).toBe(true); expect(INVESTOR_ONLY_KEYS.has("signatures")).toBe(true); });
  it("lists EIN and entity name for a trust", () => {
    const keys = perspectiveMissingFields({ person: { legal_first_name: "Kim", legal_last_name: "G" }, profile: { profile_type: "trust" }, amountCents: 100 }).map(f => f.key);
    expect(keys).toContain("legalName"); expect(keys).toContain("taxId"); expect(keys).not.toContain("firstName"); expect(keys).not.toContain("commitmentCents");
  });
});

import { isEntityProfile } from "./investor-perspective";
describe("personal vs entity accounts", () => {
  it("joint and IRA are personal, not entities", () => { expect(isEntityProfile("joint")).toBe(false); expect(isEntityProfile("ira")).toBe(false); expect(isEntityProfile("individual")).toBe(false); });
  it("trusts and LLCs are entities", () => { expect(isEntityProfile("trust")).toBe(true); expect(isEntityProfile("llc")).toBe(true); });
  it("an IRA asks for an SSN, not an EIN", () => {
    const tax = perspectiveMissingFields({ person: {}, profile: { profile_type: "ira" }, amountCents: 1 }).find(f => f.key === "taxId");
    expect(tax?.label).toBe("SSN");
  });
});
