import { describe, expect, it } from "vitest";
import { SOW_ROLE_DISCLAIMER, sowServicesBody } from "./agreement-templates";
import { cleanLineDetails } from "./sales-model";
import { servicesFromSow } from "./sales-documents-model";

describe("SOW role disclaimer", () => {
  it("is a standalone disclaimer, not buried in the Services section", () => {
    const body = sowServicesBody([{ label: "Fund administration" }]);
    expect(body).not.toContain("Harmonious acts solely as an administrative and technology service provider");
    expect(SOW_ROLE_DISCLAIMER).toContain("Harmonious acts solely as an administrative and technology service provider");
  });

  it("keeps the full list of roles Harmonious does not take on", () => {
    for (const role of ["investment adviser", "broker-dealer", "placement agent", "custodian", "transfer agent", "escrow agent", "trustee", "general partner", "fund manager", "fiduciary", "compliance officer", "valuation agent", "auditor", "accountant", "tax preparer", "legal counsel"]) {
      expect(SOW_ROLE_DISCLAIMER).toContain(role);
    }
  });

  it("adds the extra protections: no advice, no securities offer, client responsibility, no custody, MSA liability limit", () => {
    expect(SOW_ROLE_DISCLAIMER).toContain("investment, legal, accounting or tax advice");
    expect(SOW_ROLE_DISCLAIMER).toContain("an offer to sell securities");
    expect(SOW_ROLE_DISCLAIMER).toContain("solely responsible for its offering");
    expect(SOW_ROLE_DISCLAIMER).toContain("without independent verification");
    expect(SOW_ROLE_DISCLAIMER).toContain("does not hold, custody or escrow");
    expect(SOW_ROLE_DISCLAIMER).toContain("Master Services Agreement");
  });
});

describe("per-service SOW detail", () => {
  it("renders scope, included and excluded under the service", () => {
    const body = sowServicesBody([{ label: "Fund accounting", scope: "Monthly close for one vehicle", included: ["NAV report", "Investor portal"], excluded: ["Audit representation"] }]);
    expect(body).toContain("Scope: Monthly close for one vehicle");
    expect(body).toContain("Included: - NAV report; - Investor portal");
    expect(body).toContain("Not included: - Audit representation");
  });

  it("omits detail lines when none were recorded", () => {
    const body = sowServicesBody([{ label: "Fund accounting" }]);
    expect(body).not.toContain("Scope:");
    expect(body).not.toContain("Included:");
    expect(body).not.toContain("Not included:");
  });

  it("carries quote-line details into the proposal services wording", () => {
    const text = servicesFromSow([{ label: "Fund accounting", service_details: { scope: "Monthly close", included: ["NAV report"], excluded: ["Tax advice"] } }]);
    expect(text).toContain("Scope: Monthly close");
    expect(text).toContain("Included: - NAV report");
    expect(text).toContain("Not included: - Tax advice");
  });
});

describe("cleanLineDetails", () => {
  it("trims entries and drops blanks", () => {
    const out = cleanLineDetails({ scope: "  Monthly close  ", included: [" NAV report ", "", "  "], excluded: ["Tax advice"] });
    expect(out).toEqual({ scope: "Monthly close", included: ["NAV report"], excluded: ["Tax advice"] });
  });

  it("returns null when nothing meaningful was entered", () => {
    expect(cleanLineDetails(null)).toBeNull();
    expect(cleanLineDetails({ scope: "   ", included: ["", "  "], excluded: [] })).toBeNull();
  });
});
