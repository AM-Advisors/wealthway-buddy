import { describe, expect, it } from "vitest";
import { classRowsFromEconomics } from "./economics-class-records";

const ROAS = [
  { key: "series_a_1", name: "Series A-1 Preferred Interest", minInvestmentCents: 5_000_000, maxInvestmentCents: 10_000_000, preferredReturnPercent: 16 },
  { key: "series_a_2", name: "Series A-2 Preferred Interest", minInvestmentCents: 10_000_000, maxInvestmentCents: 20_000_000, preferredReturnPercent: 18 },
  { key: "series_a_3", name: "Series A-3 Preferred Interest", minInvestmentCents: 20_000_000, maxInvestmentCents: null, preferredReturnPercent: 20 },
  { key: "series_b", name: "Series B Preferred Interest", minInvestmentCents: 25_000_000, preferredReturnPercent: 0, otherDifferences: "Tiered ROAS Hedge Allocation per PPM; one-year lock-up" },
];

describe("classRowsFromEconomics", () => {
  const rows = classRowsFromEconomics("off", ROAS, 1, "2026-10-28");
  it("creates exactly four ROAS series", () => {
    expect(rows.map((r) => r.code)).toEqual(["series_a_1", "series_a_2", "series_a_3", "series_b"]);
  });
  it("keeps preferred returns as bps", () => {
    expect(rows.map((r) => r.preferred_return_bps)).toEqual([1600, 1800, 2000, 0]);
  });
  it("keeps ranges and labels", () => {
    expect(rows[0].terms.minInvestmentCents).toBe(5_000_000);
    expect(rows[0].terms.maxInvestmentCents).toBe(10_000_000);
    expect(rows[1].series_label).toBe("Series A-2");
  });
  it("records Series B lock-up, leaves fee/carry blank", () => {
    expect(rows[3].liquidity_terms).toMatch(/lock-up/);
    expect(rows[3].management_fee_bps).toBeNull();
    expect(rows[3].carry_bps).toBeNull();
  });
});
