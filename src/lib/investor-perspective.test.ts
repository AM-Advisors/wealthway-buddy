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