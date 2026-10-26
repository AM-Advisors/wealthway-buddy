import { describe, expect, it } from "vitest";
import { serviceCadenceAmount } from "./service-billing-cadence";
const roas = { pricing_type: "CUSTOM", contracted_annual_value: 48000, recurring_invoice_amount: 12000, billing_frequency: "QUARTERLY" };
const rates = { annual_price: 36000, quarterly_price: 10000 };
describe("ROAS White Glove billing choices", () => {
  it("monthly is $4,000 without replacing the negotiated price", () => expect(serviceCadenceAmount(roas, "MONTHLY", rates)).toBe(4000));
  it("quarterly is $12,000", () => expect(serviceCadenceAmount(roas, "QUARTERLY", rates)).toBe(12000));
  it("annual is $48,000", () => expect(serviceCadenceAmount(roas, "ANNUAL", rates)).toBe(48000));
  it("preserves a recorded list quarterly rate", () => expect(serviceCadenceAmount({ pricing_type: "CURRENT", contracted_annual_value: 36000 }, "QUARTERLY", rates)).toBe(10000));
  it("does not invent a price when no terms exist", () => expect(serviceCadenceAmount({}, "MONTHLY")).toBeNull());
});