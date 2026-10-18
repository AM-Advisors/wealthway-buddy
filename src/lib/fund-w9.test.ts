import { describe, expect, it } from "vitest";
import { canSignFundW9, fundW9Fill, fundW9Missing } from "./fund-w9";
import { irsFieldValues } from "./onboarding-intake-model";
import { entitySection } from "./fund-setup-phase3";

describe("fund W-9", () => {
  it("fills the fund's legal identity and EIN, not the login account", () => {
    const fill = fundW9Fill({ legal_entity_name: "Synthetic Series Fund LLC", principal_address: "123 Test St, Denver, CO 80202", tax_classification: "Partnership" }, "12-3456789");
    const fields = irsFieldValues("w9", fill);
    expect(fields.text["topmostSubform[0].Page1[0].f1_01[0]"]).toBe("Synthetic Series Fund LLC");
    expect(fields.text["topmostSubform[0].Page1[0].f1_14[0]"]).toBe("12");
    expect(fields.text["topmostSubform[0].Page1[0].f1_15[0]"]).toBe("3456789");
    expect(fill.addressLine).toBe("123 Test St");
    expect(fill.cityStateZip).toBe("Denver, CO 80202");
    expect(fundW9Missing(fill)).toEqual([]);
  });
  it("never infers federal classification from Series LLC legal form", () => {
    const fill = fundW9Fill({ legal_entity_name: "Synthetic Series", tax_classification: "Series LLC" }, "123456789");
    expect(fill.federalClassification).toBeNull();
    expect(fundW9Missing(fill)).toContain("Federal tax classification");
  });
  it("requires the exact assigned manager and an unsigned request", () => {
    expect(canSignFundW9("manager", "manager", true, "pending")).toBe(true);
    expect(canSignFundW9("staff", "manager", false, "pending")).toBe(false);
    expect(canSignFundW9("other-manager", "manager", true, "pending")).toBe(false);
    expect(canSignFundW9("manager", "manager", false, "pending")).toBe(false);
    expect(canSignFundW9("manager", "manager", true, "signed")).toBe(false);
  });
  it("a signed W-9 satisfies EIN evidence without claiming formation facts", () => {
    const facts = { path: "existing" as const, hasEin: true, hasEinLetter: false, status: null, basicsComplete: true };
    expect(entitySection({ ...facts, hasSignedW9: true }).status).toBe("complete");
    expect(entitySection({ ...facts, hasSignedW9: false }).status).toBe("in_progress");
    expect(entitySection({ ...facts, hasSignedW9: true, basicsComplete: false }).status).not.toBe("complete");
  });
});