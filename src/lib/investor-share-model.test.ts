import { describe, expect, it } from "vitest";
import { rollByYear, summarize, tieToK1, toPeriod } from "./investor-share-model";

const p = (start: string, end: string, b: number, c: number, inc: number, d: number, e: number) =>
  toPeriod({ period_start: start, period_end: end, beginning_capital_cents: b, contributions_cents: c, allocated_income_cents: inc, distributions_cents: d, ending_capital_cents: e, ownership_pct: 10 });

describe("investor share", () => {
  const periods = [p("2025-01-01", "2025-06-30", 0, 1000, 100, 0, 1100), p("2025-07-01", "2025-12-31", 1100, 0, 50, 200, 950), p("2026-01-01", "2026-03-31", 950, 0, 10, 0, 960)];
  it("rolls periods into years", () => {
    const y = rollByYear(periods);
    expect(y).toHaveLength(2);
    expect(y[0]).toMatchObject({ year: 2025, beginning: 0, contributions: 1000, income: 150, distributions: 200, ending: 950 });
  });
  it("summarizes", () => {
    expect(summarize(periods)).toMatchObject({ contributed: 1000, netIncome: 160, distributions: 200, balance: 960, asOf: "2026-03-31" });
  });
  it("ties to K-1 boxes and flags differences", () => {
    const [y25] = rollByYear(periods);
    expect(tieToK1(y25!, undefined).status).toBe("no_k1");
    expect(tieToK1(y25!, { year: 2025, boxes: { "5": 150, "19": 200 }, taxCapital: null }).status).toBe("matches");
    const bad = tieToK1(y25!, { year: 2025, boxes: { "5": 140, "19": 200 }, taxCapital: { ending_cents: 950 } });
    expect(bad.status).toBe("differs");
    expect(bad.lines.find((l) => l.label === "Net income (loss)")!.diff).toBe(10);
  });
});
