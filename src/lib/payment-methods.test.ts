import { describe, expect, it } from "vitest";
import { normalizePaymentMethods, PAYMENT_METHOD_TIMELINE } from "./payment-methods";

describe("normalizePaymentMethods", () => {
  it("keeps wire, ACH and check in a fixed order", () => {
    expect(normalizePaymentMethods(["check", "ach", "wire"])).toEqual(["wire", "ach", "check"]);
  });
  it("drops unknown methods and falls back to wire when empty", () => {
    expect(normalizePaymentMethods(["crypto"])).toEqual(["wire"]);
    expect(normalizePaymentMethods(null)).toEqual(["wire"]);
  });
  it("warns investors that ACH takes 3-5 business days", () => {
    expect(PAYMENT_METHOD_TIMELINE.ach).toContain("3-5 business days");
  });
});
