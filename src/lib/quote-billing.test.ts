import { describe, expect, it } from "vitest";
import { changeQuoteBilling, normalizeQuoteBilling, quotePeriodBaseline } from "./quote-billing";
import { priceQuote } from "./sales-model";
import { sowLinesFromQuote } from "./quote-sow-sync";

const annual = { serviceKey: "tax_k1", label: "Tax service (annual)", pricingModel: "annual", baselineCents: 250000 };
const line = { serviceKey: annual.serviceKey, label: annual.label, quantity: 1, unitCents: 62500, baselineUnitCents: 250000, billingFrequency: "quarterly" as const };

describe("quote billing period pricing", () => {
  it("compares quarterly service prices to a quarterly baseline, not a year", () => {
    const priced = priceQuote([normalizeQuoteBilling(line, annual)]);
    expect(priced.baselineCents).toBe(62500);
    expect(priced.totalCents).toBe(62500);
    expect(priced.needsExecApproval).toBe(false);
  });
  it("still requires executive review for a real quarterly discount", () => {
    expect(priceQuote([normalizeQuoteBilling({ ...line, unitCents: 62499 }, annual)]).needsExecApproval).toBe(true);
  });
  it("uses the recorded quarterly rate when it differs from annual divided by four", () => {
    const rate = { ...annual, serviceKey: "ADMIN:FUND_ADMINISTRATION:CORE", baselineCents: 1500000, quarterlyCents: 425000 };
    expect(quotePeriodBaseline(rate, "quarterly")).toBe(425000);
    expect(priceQuote([normalizeQuoteBilling({ ...line, serviceKey: rate.serviceKey, unitCents: 425000 }, rate)]).needsExecApproval).toBe(false);
  });
  it("converts annual and quarterly selections without losing negotiated pricing", () => {
    const quarterly = changeQuoteBilling({ ...line, billingFrequency: "annual", unitCents: 200000 }, annual, "quarterly");
    expect(quarterly.unitCents).toBe(50000);
    expect(changeQuoteBilling(quarterly, annual, "annual").unitCents).toBe(200000);
  });
  it("calculates an annual amount from a monthly source rate", () => {
    expect(quotePeriodBaseline({ ...annual, pricingModel: "monthly", baselineCents: 400000 }, "annual")).toBe(4800000);
    expect(quotePeriodBaseline({ ...annual, pricingModel: "monthly", baselineCents: 400000 }, "quarterly")).toBe(1200000);
  });
  it("does not divide one-time SPV package fees", () => {
    expect(quotePeriodBaseline({ ...annual, serviceKey: "SPV_TXN:demo", pricingModel: "one_time" }, "quarterly")).toBe(250000);
  });
  it("keeps SaaS quarterly or annual only", () => {
    const rate = { ...annual, serviceKey: "ADMIN:FUND_ADMINISTRATION:SAAS" };
    expect(() => normalizeQuoteBilling({ ...line, billingFrequency: "monthly" }, rate)).toThrow(/quarterly or annual/);
    expect(normalizeQuoteBilling(line, rate).billingFrequency).toBe("quarterly");
  });
  it("carries selected per-bill prices and frequency into the linked SOW", () => {
    const normalized = normalizeQuoteBilling(line, annual);
    const [sow] = sowLinesFromQuote([{ service_key: normalized.serviceKey, label: normalized.label, quantity: 1,
      unit_cents: normalized.unitCents, baseline_unit_cents: normalized.baselineUnitCents, line_cents: normalized.unitCents,
      sort_order: 0, billing_frequency: normalized.billingFrequency ?? "one_time", first_bill_on: null,
      bookkeeping_snapshot: null, service_details: null }]);
    expect(sow?.unit_cents).toBe(62500);
    expect(sow?.billing_frequency).toBe("quarterly");
  });
});