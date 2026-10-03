import { describe, expect, it } from "vitest";
import { balanceTie, deriveK1Totals, investorBasis, investorDistributions } from "./fund-books-model";

const e = (entry_date: string, category: string, direction: "in" | "out", amount_cents: number, onboarding_id: string | null = null) => ({ entry_date, category, direction, amount_cents, onboarding_id });

describe("fund books model", () => {
  const rows = [
    e("2025-01-10", "Capital contribution", "in", 100_00, "a"), e("2025-02-10", "Capital contribution", "in", 300_00, "b"),
    e("2025-03-01", "Interest income", "in", 12_00), e("2025-04-01", "Management fee", "out", 5_00), e("2025-05-01", "Dividend income", "in", 7_00),
    e("2025-06-01", "Distribution", "out", 20_00, "b"), e("2024-06-01", "Interest income", "in", 99_00),
  ];
  it("derives K-1 totals for the year only", () => {
    expect(deriveK1Totals(rows, 2025)).toMatchObject({ interest: 12_00, dividends: 7_00, deductions: 5_00, distributions: 20_00 });
  });
  it("bases shares on tagged contributions and keeps distributions per investor", () => {
    expect(investorBasis(rows, 2025).get("b")).toBe(300_00);
    expect(investorDistributions(rows, 2025).get("b")).toBe(20_00);
  });
  it("checks the statement balance tie", () => {
    expect(balanceTie(1000, 1500, [{ amount_cents: 600, direction: "in" }, { amount_cents: 100, direction: "out" }]).ties).toBe(true);
    expect(balanceTie(1000, 1400, [{ amount_cents: 600, direction: "in" }]).gapCents).toBe(-200);
  });
});

import { buildStatements as bs2, liabilitiesAt } from "./fund-books-model";
test("liabilities reduce partners' capital and drop once settled", () => {
  const ls = [{ amount_cents: 500, incurred_on: "2025-01-10", settled_on: "2025-03-01" }, { amount_cents: 200, incurred_on: "2025-02-01", settled_on: null }];
  expect(liabilitiesAt(ls, "2025-02-15")).toBe(700);
  expect(liabilitiesAt(ls, "2025-03-01")).toBe(200);
  const s = bs2([{ entry_date: "2025-01-05", category: "Capital contribution", direction: "in", amount_cents: 10000 }], "2025-01-01", "2025-12-31", [], 200);
  expect(s.balanceSheet.partnersCapitalCents).toBe(9800);
});
