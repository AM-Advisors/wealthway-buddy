import { describe, expect, it } from "vitest";
import { isPricingOverride, assertPricingOverrideAllowed, CLIENT_SERVICE_FIELDS, INTERNAL_ONLY_SERVICE_FIELDS } from "./service-pricing-rules";

describe("service pricing permissions", () => {
  it("non-admins cannot set grandfathered pricing", () => {
    const f = { service_level: "FUND_ADMINISTRATION", grandfathered: true, pricing_type: "GRANDFATHERED", pricing_override_reason: "Legacy client from 2024 pricing" };
    expect(isPricingOverride(f, 15000, 20000)).toBe(true);
    expect(() => assertPricingOverrideAllowed(false, f)).toThrow(/Admin/);
    expect(() => assertPricingOverrideAllowed(true, f)).not.toThrow();
  });
  it("non-admins cannot set negotiated/custom or off-list prices", () => {
    expect(isPricingOverride({ service_level: "WHITE_GLOVE", pricing_type: "NEGOTIATED" }, 36000, 36000)).toBe(true);
    expect(isPricingOverride({ service_level: "WHITE_GLOVE" }, 30000, 36000)).toBe(true);
    expect(() => assertPricingOverrideAllowed(false, { service_level: "WHITE_GLOVE", pricing_type: "CUSTOM" })).toThrow();
    expect(() => assertPricingOverrideAllowed(true, { service_level: "WHITE_GLOVE", pricing_type: "CUSTOM", pricing_override_reason: "short" })).toThrow(/reason/);
  });
  it("list price and Institutional quotes are not overrides", () => {
    expect(isPricingOverride({ service_level: "FUND_ADMINISTRATION" }, 20000, 20000)).toBe(false);
    expect(isPricingOverride({ service_level: "INSTITUTIONAL" }, 87500, 60000)).toBe(false);
  });
  it("client-facing service queries never select internal fields", () => {
    for (const f of INTERNAL_ONLY_SERVICE_FIELDS) expect(CLIENT_SERVICE_FIELDS).not.toContain(f);
  });
});
