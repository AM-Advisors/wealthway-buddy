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
