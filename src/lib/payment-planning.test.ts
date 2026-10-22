import { describe, expect, it } from "vitest";
import { paymentPlanDates, selectedPaymentTotals, type PlanningPayment } from "./payment-planning";
const rows: [PlanningPayment, PlanningPayment, PlanningPayment] = [
  { id: "a", label: "A", cents: 10000, date: "2026-01-31", status: "paid" },
  { id: "b", label: "B", cents: 20000, date: "2026-03-01", status: "paid" },
  { id: "c", label: "C", cents: 40000, date: "2026-04-01", status: "issued" },
];
describe("selected payment reporting", () => {
  it("monthly totals include only selected payments", () => expect(selectedPaymentTotals(rows, ["a", "b"], "monthly").map(r => [r.period, r.cents])).toEqual([["2026-01", 10000], ["2026-03", 20000]]));
  it("quarterly totals combine months, not quarters", () => expect(selectedPaymentTotals(rows, ["a", "b", "c"], "quarterly").map(r => [r.period, r.cents])).toEqual([["2026 Q1", 30000], ["2026 Q2", 40000]]));
  it("annual totals combine selected payments", () => expect(selectedPaymentTotals(rows, ["a", "c"], "annual")[0]?.cents).toBe(50000));
  it("does not count duplicate or cancelled payments", () => expect(selectedPaymentTotals([...rows, rows[0], { ...rows[1], id: "void", status: "void" }], ["a", "a", "void"], "annual")[0]?.cents).toBe(10000));
  it("keeps currencies separate", () => expect(selectedPaymentTotals([rows[0], { ...rows[1], currency: "EUR" }], ["a", "b"], "annual").length).toBe(2));
  it("empty selection has no totals", () => expect(selectedPaymentTotals(rows, [], "annual")).toEqual([]));
});
describe("independent payment schedule", () => {
  it("quarterly schedule has four dates, clamping month end", () => expect(paymentPlanDates("2026-01-31", "quarterly")).toEqual(["2026-01-31", "2026-04-30", "2026-07-31", "2026-10-31"]));
  it("annual schedule has one date", () => expect(paymentPlanDates("2026-12-31", "annual")).toEqual(["2026-12-31"]));
  it("rejects nonexistent dates", () => expect(() => paymentPlanDates("2026-02-30", "quarterly")).toThrow());
  it("reporting cadence cannot change scheduling dates", () => { selectedPaymentTotals(rows, ["a"], "monthly"); expect(paymentPlanDates("2026-03-31", "annual")).toEqual(["2026-03-31"]); });
});