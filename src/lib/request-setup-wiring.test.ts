import { describe, expect, it } from "vitest";
import { eligibilityCovered, eligibilityFromAnswer, managementCompanyStatus, requestWiring } from "./request-setup-wiring";
import { eligibilityFor } from "./client-portal-model";

describe("fund request answers feed real Setup steps", () => {
  it("506(c) eligibility asks investors to be accredited", () => {
    expect(eligibilityFromAnswer(eligibilityFor("506(c)")).keys).toEqual(["accredited_investor"]);
  });
  it("506(b), Reg CF and Reg A answers add no accreditation requirement", () => {
    for (const ex of ["506(b)", "Reg CF", "Reg A (Tier 1)", "Reg A+ (Tier 2)"]) expect(eligibilityFromAnswer(eligibilityFor(ex)).keys).toEqual([]);
  });
  it("qualified purchaser and qualified client answers are carried", () => {
    expect(eligibilityFromAnswer("Accredited investors and qualified purchasers only").keys).toEqual(["accredited_investor", "qualified_purchaser"]);
    expect(eligibilityFromAnswer("Qualified clients").keys).toEqual(["qualified_client"]);
  });
  it("a Not sure answer is left for a person to decide", () => {
    expect(eligibilityFromAnswer(eligibilityFor("Not sure")).undetermined).toBe(true);
  });
  it("approved requirements cover the request only when every asked item is on", () => {
    expect(eligibilityCovered(["accredited_investor"], ["accredited_investor", "minimum_investment"])).toBe(true);
    expect(eligibilityCovered(["accredited_investor"], [])).toBe(false);
    expect(eligibilityCovered([], null)).toBe(true);
  });
  it("banking answers become who opens the account and the preferred bank", () => {
    expect(requestWiring({ banking_path: "harmonious" }).banking).toEqual({ setupBy: "harmonious", preferredBank: null, partnerBank: null });
    expect(requestWiring({ banking_path: "client", bank_name: "Chase" }).banking).toEqual({ setupBy: "fund", preferredBank: "Chase", partnerBank: null });
    expect(requestWiring({ bank_name: "Texas Capital" }).banking?.partnerBank).toBe("texas_capital");
    expect(requestWiring({}).banking).toBeNull();
  });
  it("management company answer: a new company starts planned, a transfer is already active", () => {
    expect(requestWiring({ management_llc_path: "setup" }).managementCompany).toEqual({ path: "setup" });
    expect(managementCompanyStatus("setup")).toBe("planned");
    expect(managementCompanyStatus("transfer")).toBe("active");
    expect(requestWiring({ management_llc_path: "" }).managementCompany).toBeNull();
  });
});
