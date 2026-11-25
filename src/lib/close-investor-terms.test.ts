import { describe, expect, it } from "vitest";
import { closeInvestorTerms, closeManagementFee, type CloseLetter } from "./close-investor-terms";
const today = new Date("2026-11-25T00:00:00Z");
const letter: CloseLetter = { id: "kim-letter", offering_id: "erebor", onboarding_id: "trust", status: "active", effective_date: null, expiry_date: null, terms: [{ category: "fee_discount", value: "0%" }, { category: "carry_reduction", value: "0%" }], current_version: 2 };
describe("close investor side letters", () => {
  it("recognizes the trust's 0% fee and carry without applying them to other investors", () => {
    const trust = closeInvestorTerms("erebor", "trust", [letter], today);
    expect(trust.feeOverride).toBe(0); expect(trust.carryOverride).toBe(0);
    const other = closeInvestorTerms("erebor", "other", [letter], today);
    expect(other.letters).toEqual([]);
    expect(closeManagementFee([{ amountCents: 5000000, terms: trust }, { amountCents: 5000000, terms: other }], 6)).toBe(300000);
  });
  it("shows proposed letters without applying proposed rates", () => {
    const result = closeInvestorTerms("erebor", "trust", [{ ...letter, status: "proposed" }], today);
    expect(result.letters[0]?.applicable).toBe(false); expect(result.feeOverride).toBeNull();
  });
  it("does not substitute default fees when active letters conflict", () => {
    const terms = closeInvestorTerms("erebor", "trust", [letter, { ...letter, id: "conflict", terms: [{ category: "fee_discount", value: "1%" }] }], today);
    expect(terms.error).toContain("different fees"); expect(closeManagementFee([{ amountCents: 5000000, terms }], 6)).toBeNull();
  });
  it("retains other terms and version references for review", () => {
    const terms = closeInvestorTerms("erebor", "trust", [{ ...letter, terms: [{ category: "information_rights", description: "Quarterly reports", value: "Quarterly" }] }], today);
    expect(terms.letters[0]?.version).toBe(2); expect(terms.letters[0]?.terms[0]?.value).toBe("Quarterly");
  });
});