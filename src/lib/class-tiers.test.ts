import { describe, expect, it } from "vitest";
import { classForAmount, resolveSigningClass, seriesGroup } from "./class-tiers";

const roas = [
  { key: "series_a_1", name: "Series A-1", minInvestmentCents: 5_000_000, maxInvestmentCents: 10_000_000 },
  { key: "series_a_2", name: "Series A-2", minInvestmentCents: 10_000_000, maxInvestmentCents: 20_000_000 },
  { key: "series_a_3", name: "Series A-3", minInvestmentCents: 20_000_000, maxInvestmentCents: null },
  { key: "series_b", name: "Series B", minInvestmentCents: 25_000_000, maxInvestmentCents: null },
];

describe("ROAS series ranges", () => {
  it("$50,000 is Series A-1", () => expect(classForAmount(roas, 5_000_000)).toEqual({ status: "assigned", key: "series_a_1" }));
  it("$99,999 is Series A-1", () => expect(classForAmount(roas, 9_999_900)).toEqual({ status: "assigned", key: "series_a_1" }));
  it("$100,000 is Series A-2", () => expect(classForAmount(roas, 10_000_000)).toEqual({ status: "assigned", key: "series_a_2" }));
  it("$200,000 is Series A-3", () => expect(classForAmount(roas, 20_000_000)).toEqual({ status: "assigned", key: "series_a_3" }));
  it("$250,000 needs a manager or Harmonious choice between A-3 and B", () =>
    expect(classForAmount(roas, 25_000_000)).toEqual({ status: "choose", keys: ["series_a_3", "series_b"] }));
  it("$10,000,000 has no top: still A-3 or B", () => expect(classForAmount(roas, 1_000_000_000).status).toBe("choose"));
  it("below $50,000 is below minimum", () => expect(classForAmount(roas, 4_999_900)).toEqual({ status: "below_minimum", minimumCents: 5_000_000 }));
  it("a recorded Series B choice is used at $250,000", () =>
    expect(resolveSigningClass(roas, 25_000_000, "series_b")).toEqual({ status: "assigned", key: "series_b" }));
  it("a stale recorded class is replaced when the amount moves tiers", () =>
    expect(resolveSigningClass(roas, 5_000_000, "series_a_3")).toEqual({ status: "assigned", key: "series_a_1" }));
  it("series group", () => { expect(seriesGroup("Series A-2 Preferred Interest")).toBe("A"); expect(seriesGroup("Series B Preferred Interest")).toBe("B"); });
});
