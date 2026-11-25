import { describe, expect, it } from "vitest";
import { estimateCloseFilingCosts, stateCode } from "./blue-sky-fees";

describe("close filing estimate", () => {
  it("always includes the $160 Form D filing", () => {
    expect(estimateCloseFilingCosts({ investorStates: [], filedStates: [] }).totalCents).toBe(16000);
  });
  it("counts a state once for many investors", () => {
    const e = estimateCloseFilingCosts({ investorStates: ["Utah", "UT", "ut"], filedStates: [] });
    expect(e.lines).toEqual([{ state: "UT", investors: 3, status: "fee", cents: 10000 }]);
    expect(e.totalCents).toBe(26000);
  });
  it("charges nothing for a state already filed", () => {
    const e = estimateCloseFilingCosts({ investorStates: ["IL"], filedStates: ["Illinois"] });
    expect(e.lines[0]?.status).toBe("filed");
    expect(e.totalCents).toBe(16000);
  });
  it("flags formula states instead of guessing", () => {
    const e = estimateCloseFilingCosts({ investorStates: ["Texas"], filedStates: [] });
    expect(e.needsReview).toEqual(["TX"]);
    expect(e.totalCents).toBe(16000);
  });
  it("ignores unknown regions", () => { expect(stateCode("Ontario")).toBeNull(); });
});
