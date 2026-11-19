import { describe, it, expect } from "vitest";
import { isEmployeeEmail, testInvestorChangeError } from "@/lib/test-investor";
import { countsInFundTotals } from "@/lib/investment-amounts";

describe("test investors", () => {
  it("any email ending in @harmonious.co is an employee", () => {
    expect(isEmployeeEmail("jenner@harmonious.co")).toBe(true);
    expect(isEmployeeEmail(" Apoorva+test1@Harmonious.co ")).toBe(true);
    expect(isEmployeeEmail("someone@harmoniouscapital.com")).toBe(false);
    expect(isEmployeeEmail("x@notharmonious.co.uk")).toBe(false);
    expect(isEmployeeEmail(null)).toBe(false);
  });
  it("a Harmonious email can never be turned back into a real investor", () => {
    expect(testInvestorChangeError(false, [null, "jenner@harmonious.co"])).not.toBeNull();
    expect(testInvestorChangeError(false, ["investor@gmail.com"])).toBeNull();
    expect(testInvestorChangeError(true, ["investor@gmail.com"])).toBeNull();
  });
  it("test investors never count in fund totals", () => {
    expect(countsInFundTotals({ is_test_investor: true })).toBe(false);
    expect(countsInFundTotals({ is_test_investor: false })).toBe(true);
    expect(countsInFundTotals({ removed_at: "2026-11-01" })).toBe(false);
  });
});
