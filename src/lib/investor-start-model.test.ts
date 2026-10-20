import { describe, expect, it } from "vitest";
import { missingProfileFields, msaApplies, planStartFund, profileFillPatch } from "./investor-start-model";
import { FUND_SETUP_FEE_CENTS } from "./fund-payments.server";

describe("signed-in investor start", () => {
  it("an investor-only account is never asked for the MSA", () => {
    expect(msaApplies([], false)).toBe(false);
  });
  it("a new client organization requires the MSA", () => {
    expect(msaApplies(["client-1"], false)).toBe(true);
  });
  it("starting a fund costs $2,500", () => {
    expect(FUND_SETUP_FEE_CENTS).toBe(250000);
  });
  it("creates an organization only when the person has none", () => {
    expect(planStartFund([])).toEqual({ kind: "create" });
    expect(planStartFund([{ clientId: "c1", role: "client_gp" }])).toEqual({ kind: "reuse", clientId: "c1" });
    expect(planStartFund([{ clientId: "c1", role: "client_viewer" }]).kind).toBe("refuse");
  });
  it("asks only for missing profile fields and never overwrites recorded ones", () => {
    const person = { legal_first_name: "Calvin", legal_last_name: "Jung", phone: "", address_line1: null, city: "Denver", postal_code: "80202", country: "US" };
    expect(missingProfileFields(person, { isStaff: false })).toEqual(["phone", "address_line1"]);
    expect(missingProfileFields(person, { isStaff: true })).toEqual([]);
    expect(profileFillPatch(person, { legal_first_name: "Other", phone: "555" })).toEqual({ phone: "555" });
  });
});
