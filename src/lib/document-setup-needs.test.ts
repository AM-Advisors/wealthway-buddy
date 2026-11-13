import { describe, expect, it } from "vitest";
import { documentNeedsMessage, documentSetupNeeds, setupNeedForBlank } from "./document-setup-needs";

describe("fund details that documents need", () => {
  it("a memorandum missing the fund term and phone asks setup for both", () => {
    const needs = documentSetupNeeds(["Fund Term", "Manager Phone"], {});
    expect(needs.map((n) => n.key)).toEqual(["fundTerm", "contactPhone"]);
    expect(documentNeedsMessage(needs)).toBe("Add the fund term and fund phone number: a fund document needs them");
  });
  it("a recorded detail is no longer asked for", () => {
    expect(documentSetupNeeds(["Fund Term", "Tel"], { fundTerm: 84, contactPhone: "+1 214-555-0100" })).toEqual([]);
  });
  it("blank names match however the template spells them", () => {
    expect(setupNeedForBlank("{{Arbitration City}}")).toBe("arbitrationCity");
    expect(setupNeedForBlank("Signatory's Title")).toBe("signatoryTitle");
    expect(setupNeedForBlank("Manager Address")).toBe("principalAddress");
  });
  it("blanks that are not fund details are not setup to-dos", () => {
    expect(documentSetupNeeds(["Unlabeled blank", "Investor Name"], {})).toEqual([]);
  });
});
