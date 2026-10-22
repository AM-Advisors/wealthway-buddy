import { describe, expect, it } from "vitest";
import { activeCosts, commissionProfit, lineActualCosts, settingsAt } from "./commission-profit-model";
describe("gross-profit commissions", () => {
  it("deducts pass-through and actual provider/deal costs, never the estimate too", () => {
    expect(commissionProfit({ revenueCents: 100000, passThroughCents: 10000, actualCosts: [20000, 5000], costPct: 90, rates: [10, 2, 5, 5, 5], processingFeeCents: 3000, overheadPct: 10 })).toEqual({ revenueCents: 100000, grossProfitCents: 65000, commissionCents: 17550, commissions: [6500, 1300, 3250, 3250, 3250], netProfitCents: 34450 });
  });
  it("uses estimates only without actuals, including cap table and zero actuals", () => {
    expect(commissionProfit({ revenueCents: 100000, costPct: 30, rates: [15, 2, 5, 5] })).toMatchObject({ grossProfitCents: 70000, commissions: [10500, 1400, 3500, 3500], netProfitCents: 51100 });
    expect(commissionProfit({ revenueCents: 100000, actualCosts: [0], costPct: 30, rates: [10] }).grossProfitCents).toBe(100000);
  });
  it("floors gross profit, not net profit", () => {
    expect(commissionProfit({ revenueCents: 100, actualCosts: [200], rates: [10], overheadPct: 10 })).toMatchObject({ grossProfitCents: 0, commissionCents: 0, netProfitCents: -10 });
  });
  it("selects effective settings and superseding entries", () => {
    const versions = [{ effective_at: "2025-01-01", service_cost_pct: { tax: 20 }, overhead_pct: 5 }, { effective_at: "2026-01-01", service_cost_pct: { tax: 40 }, overhead_pct: 10 }];
    expect(settingsAt(versions, "2025-06-01").service_cost_pct.tax).toBe(20);
    const entries = [{ id: "a", invoice_id: "i", service_key: "tax", kind: "provider" as const, amount_cents: 100 }, { id: "b", invoice_id: "i", service_key: "tax", kind: "provider" as const, amount_cents: 200, supersedes_id: "a" }];
    expect(activeCosts(entries).map(e => e.id)).toEqual(["b"]);
    expect(lineActualCosts(entries, "i", null, "tax", 500, 1000, 1000)).toEqual([100]);
  });
});
