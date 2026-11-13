import { describe, expect, it } from "vitest";
import { documentNeedsMessage, documentSetupNeeds, setupNeedForBlank } from "./document-setup-needs";
import { isSigningTimeBlank } from "./document-blanks";
import { sectionStatuses } from "./fund-setup-canonical";

describe("fund details that Harmonious templates need", () => {
  it("a memorandum missing the fund term and phone asks setup for both", () => {
    const needs = documentSetupNeeds(["Fund Term", "Manager Phone"], { "Fund Term": null, "Manager Phone": null });
    expect(needs.map((n) => n.key)).toEqual(["fundTerm", "contactPhone"]);
    expect(documentNeedsMessage(needs)).toBe("Add the fund term and fund phone number: a fund document needs them");
  });
  it("a recorded detail is no longer asked for", () => {
    expect(documentSetupNeeds(["Fund Term", "Tel"], { "Fund Term": "seven-year", Tel: "(214) 555-0100" })).toEqual([]);
  });
  it("every fund detail a template uses is required, including fees and the signatory", () => {
    const needs = documentSetupNeeds(
      ["Fund Name", "State", "carry amount", "fund Manager signatory title", "Manager Email", "Registered Agent", "Fiscal Year End"],
      { "Fund Name": "Corps LaaSy", State: null, "Carry Amount": null, "Fund Manager Signatory Title": "", email: null, "Registered Agent": null, "Fiscal Year End": null },
    );
    expect(needs.map((n) => [n.key, n.step])).toEqual([
      ["stateFormed", "fund_details"], ["carry", "economics"], ["signatoryTitle", "signatory"],
      ["contactEmail", "signatory"], ["registeredAgent", "fund_details"], ["fiscalYearEnd", "fund_details"],
    ]);
  });
  it("blank names match however the template spells them", () => {
    expect(setupNeedForBlank("{{Arbitration City}}")).toBe("arbitrationCity");
    expect(setupNeedForBlank("Signatory's Title")).toBe("signatoryTitle");
    expect(setupNeedForBlank("Manager Address")).toBe("principalAddress");
    expect(setupNeedForBlank("Legal fund name")).toBe("legalName");
  });
  it("blanks that are not fund details are not setup to-dos", () => {
    expect(documentSetupNeeds(["Unlabeled blank", "Investor Name", "Country"], {})).toEqual([]);
  });
  it("subscription agreement signing blanks are filled per investor, never in setup", () => {
    expect(isSigningTimeBlank("Signature", "subscription_agreement")).toBe(true);
    expect(isSigningTimeBlank("Subscription Amount", "subscription_agreement")).toBe(true);
    expect(isSigningTimeBlank("Arbitration City", "subscription_agreement")).toBe(false);
    expect(isSigningTimeBlank("Signatory Title", "operating_agreement")).toBe(false);
  });
  it("a missing fee detail a template needs keeps Offering & economics open", () => {
    const base = { fundType: "SPV", legalName: "A LLC", gpName: "GP", signatoryPersonId: "p", signatoryTitle: "MM", fiscalYearEnd: "12-31", entityType: "LLC", jurisdiction: "DE", formationDate: "2026-01-01", hasEin: true, regType: "506c", minInvestmentCents: 100, targetRaiseCents: 100, managementFeeSet: true, carrySet: true, economicsStatus: "approved", hasMultipleClasses: false, classCount: 0, documentCount: 1, bankingState: "active", adminConfigured: true } as any;
    expect(sectionStatuses(base).offering_economics.status).toBe("complete");
    const s = sectionStatuses({ ...base, economicsDocumentNeeds: ["Preferred return"] });
    expect(s.offering_economics.next).toBe("Add the preferred return: a fund document needs it");
  });
});
