import { describe, it, expect } from "vitest";
import { classSummaryRows } from "./fund-setup-form-model";
const fee = { ratePercent: 2, basis: "capital_account", frequency: "annual", paymentTerms: "paid quarterly" };
describe("classSummaryRows", () => {
  it("formats an A class range, fee and preferred return", () => {
    const r = classSummaryRows({ name: "A-2", managementFee: fee, carry: { ratePercent: null }, preferredReturnPercent: 18, minInvestmentCents: 10_000_000, maxInvestmentCents: 20_000_000 });
    expect(r.range).toBe("$100K to under $200K");
    expect(r.rows).toContainEqual(["Management fee", "2% per year on capital account, paid quarterly"]);
    expect(r.rows).toContainEqual(["Preferred return", "18%"]);
    expect(r.rows).toContainEqual(["Carried interest", "None"]);
  });
  it("shows tiered profit sharing and no preferred return for B", () => {
    const r = classSummaryRows({ name: "B", managementFee: fee, carry: { ratePercent: null, applicability: "Tiered per PPM" }, preferredReturnPercent: null, minInvestmentCents: 25_000_000 });
    expect(r.range).toBe("$250K and up");
    expect(r.rows).toContainEqual(["Carried interest", "Tiered profit sharing"]);
    expect(r.rows).toContainEqual(["Preferred return", "None"]);
  });
});
