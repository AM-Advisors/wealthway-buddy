import { describe, expect, it } from "vitest";
import {
  classAssignmentError,
  classErrors,
  economicsErrors,
  effectiveEconomics,
  formatEin,
  legalNameChangeWarning,
  normalizeEin,
  sectionStatuses,
  setupCompletion,
  structureForFundType,
  termApplies,
  type SetupFacts,
} from "./fund-setup-canonical";

const base: SetupFacts = {
  fundType: "SPV", legalName: null, displayName: "X", gpName: null, signatoryPersonId: null, signatoryTitle: null,
  fiscalYearEnd: null, fundTermMonths: null, investmentPeriodMonths: null, entityType: null, jurisdiction: null,
  formationDate: null, hasEin: false, regType: "506b", minInvestmentCents: 0, targetRaiseCents: null,
  economicsStatus: "none", managementFeeSet: false, carrySet: false, hasMultipleClasses: false, classCount: 0,
  documentCount: 0, bankingState: "none", adminConfigured: false,
};

describe("fund setup canonical rules", () => {
  it("does not force a fund term on an SPV", () => {
    expect(termApplies("SPV")).toBe(false);
    expect(termApplies("Venture capital")).toBe(true);
    const s = sectionStatuses({ ...base, legalName: "A LLC", gpName: "GP", signatoryPersonId: "p", signatoryTitle: "MM", fiscalYearEnd: "12-31" });
    expect(s.fund_details.status).toBe("complete");
    const vc = sectionStatuses({ ...base, fundType: "Venture capital", legalName: "A LP", gpName: "GP", signatoryPersonId: "p", signatoryTitle: "MM", fiscalYearEnd: "12-31" });
    expect(vc.fund_details.status).toBe("in_progress");
  });
  it("requires a Fund Signatory for Fund Details to complete", () => {
    const s = sectionStatuses({ ...base, legalName: "A LLC", gpName: "GP", fiscalYearEnd: "12-31" });
    expect(s.fund_details.next).toMatch(/Signatory/);
  });
  it("classes are Not Applicable when the fund has one class", () => {
    expect(sectionStatuses(base).classes.status).toBe("not_applicable");
    expect(sectionStatuses({ ...base, hasMultipleClasses: true }).classes.status).toBe("not_started");
  });
  it("calculates setup completion only from applicable canonical sections", () => {
    const statuses = sectionStatuses(base);
    expect(setupCompletion(statuses)).toBe(0);
    expect(setupCompletion({ ...statuses, fund_details: { status: "complete", next: null } })).toBe(14);
    expect(setupCompletion({ ...statuses, review: { status: "complete", next: null }, classes: { status: "not_applicable", next: null } })).toBe(14);
    expect(setupCompletion({ ...statuses, classes: { status: "complete", next: null } })).toBe(13);
  });
  it("economics stay incomplete until approved by a second reviewer", () => {
    const s = sectionStatuses({ ...base, minInvestmentCents: 100, targetRaiseCents: 1, managementFeeSet: true, carrySet: true, economicsStatus: "draft" });
    expect(s.offering_economics.status).toBe("in_progress");
    expect(s.offering_economics.next).toMatch(/second/);
  });
  it("validates structured management fee without inferring terms", () => {
    expect(economicsErrors({ managementFee: { ratePercent: 2, basis: null, frequency: null }, carry: null })).toHaveLength(2);
    expect(economicsErrors({ managementFee: { ratePercent: 2, basis: "committed_capital", frequency: "annual" }, carry: { ratePercent: 20 } })).toEqual([]);
    expect(economicsErrors({ managementFee: null, carry: { ratePercent: 150 } })).toHaveLength(1);
  });
  it("class economics override defaults and fall back when blank", () => {
    const d = { managementFee: { ratePercent: 2, basis: "nav" as const, frequency: "annual" as const }, carry: { ratePercent: 20 } };
    const e = effectiveEconomics(d, { key: "b", name: "B", carry: { ratePercent: 10 } });
    expect(e.carry?.ratePercent).toBe(10);
    expect(e.managementFee?.ratePercent).toBe(2);
    expect(classErrors([{ key: "a", name: "A" }, { key: "a", name: "A" }])).toContain('Class "A" appears twice.');
  });
  it("investments only reference an existing class", () => {
    const classes = [{ key: "class_a", name: "Class A" }];
    expect(classAssignmentError({ hasMultipleClasses: true, classes, classKey: "class_a" })).toBeNull();
    expect(classAssignmentError({ hasMultipleClasses: true, classes, classKey: "class_z" })).toMatch(/does not exist/);
    expect(classAssignmentError({ hasMultipleClasses: false, classes, classKey: "class_a" })).toMatch(/multiple/);
  });
  it("normalizes and formats EINs", () => {
    expect(normalizeEin("12-3456789")).toBe("123456789");
    expect(formatEin("123456789")).toBe("12-3456789");
    expect(normalizeEin("123")).toBeNull();
  });
  it("warns before a Legal Name change only when downstream records exist", () => {
    expect(legalNameChangeWarning({ current: "A", next: "B", downstream: { investments: 0, signedDocuments: 0 } })).toBeNull();
    expect(legalNameChangeWarning({ current: null, next: "B", downstream: { investments: 3, signedDocuments: 1 } })).toBeNull();
    expect(legalNameChangeWarning({ current: "A", next: "B", downstream: { investments: 3, signedDocuments: 1 } })).toMatch(/keep the name/);
  });
  it("maps existing fund types onto setup structures", () => {
    expect(structureForFundType("Single asset SPV")).toBe("spv");
    expect(structureForFundType("Venture capital")).toBe("vc_fund");
  });
});
