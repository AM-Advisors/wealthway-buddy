import { describe, expect, it } from "vitest";
import { closeSideLetterPricing } from "./close-side-letter-pricing";

const L = (id: string, ob: string, status = "proposed", pay: string | null = null) => ({ id, onboarding_id: ob, status, fee_payment_id: pay });

describe("close side-letter pricing", () => {
  it("charges $1,500 per side letter for selected investors", () => {
    const r = closeSideLetterPricing(["a", "b"], [L("1", "a"), L("2", "a"), L("3", "b"), L("4", "c")], []);
    expect(r.count).toBe(3);
    expect(r.feeCents).toBe(450000);
    expect(r.perInvestor).toEqual({ a: 2, b: 1 });
  });
  it("does not charge twice for already-paid side letters", () => {
    const r = closeSideLetterPricing(["a"], [L("1", "a", "approved", "p1"), L("2", "a")], ["p1"]);
    expect(r.paidCount).toBe(1);
    expect(r.feeCents).toBe(150000);
  });
  it("ignores terminated side letters", () => {
    expect(closeSideLetterPricing(["a"], [L("1", "a", "terminated")], []).count).toBe(0);
  });
});
