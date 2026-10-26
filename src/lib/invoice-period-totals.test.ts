import { expect, it } from "vitest";
import { invoicePeriodTotals } from "./invoice-period-totals";
const invoice = { id: "roas", total_cents: 1900000, recorded_paid_cents: 1150000, recorded_paid_on: "2026-09-21", issue_date: "2026-08-21", status: "issued" };
it("monthly reports August billing/balance and September receipts separately", () => {
  expect(invoicePeriodTotals([invoice], ["roas"], "monthly")).toEqual([
    { period: "2026-08", currency: "USD", billedCents: 1900000, paidCents: 0, remainingCents: 750000 },
    { period: "2026-09", currency: "USD", billedCents: 0, paidCents: 1150000, remainingCents: 0 },
  ]);
});
it("quarterly reports $19,000 billed, $11,500 received, $7,500 remaining", () => {
  expect(invoicePeriodTotals([invoice], ["roas"], "quarterly")[0]).toEqual({ period: "2026 Q3", currency: "USD", billedCents: 1900000, paidCents: 1150000, remainingCents: 750000 });
});
it("annual retains the same balances without splitting invoice terms", () => {
  expect(invoicePeriodTotals([invoice], ["roas"], "annual")[0]).toEqual({ period: "2026", currency: "USD", billedCents: 1900000, paidCents: 1150000, remainingCents: 750000 });
});
it("missing receipt dates stay undated and never use the invoice date", () => {
  expect(invoicePeriodTotals([{ ...invoice, recorded_paid_on: null }], ["roas"], "annual").find(x => x.period === "Undated")?.paidCents).toBe(1150000);
});
it("excludes void invoices and duplicate/unselected records", () => {
  expect(invoicePeriodTotals([invoice, invoice, { ...invoice, id: "void", status: "void" }], ["roas", "void"], "annual")[0]?.billedCents).toBe(1900000);
});