import { describe, expect, it } from "vitest";
import { commercialAreas, commercialBalanceTotals } from "./commercial-workflow-model";
describe("connected commercial records", () => {
  it("does not grant Marketing money or Sales authority", () => expect(commercialAreas(["marketing_specialist"])).toMatchObject({ marketing: true, sales: false, finance: false, feeReview: false }));
  it("does not grant Finance fee-preview administration", () => expect(commercialAreas(["finance"])).toMatchObject({ finance: true, feeReview: false }));
  it("keeps partial invoice receipts separate from outstanding balances", () => expect(commercialBalanceTotals([{ total_cents: 1200000, recorded_paid_cents: 450000, status: "issued", due_date: "2026-10-31" }], "2026-11-01")).toEqual({ billed: 1200000, received: 450000, remaining: 750000, overdue: 750000 }));
  it("excludes unissued drafts from actual invoice totals", () => expect(commercialBalanceTotals([{ total_cents: 1200000, status: "draft" }], "2026-11-01")).toEqual({ billed: 0, received: 0, remaining: 0, overdue: 0 }));
});