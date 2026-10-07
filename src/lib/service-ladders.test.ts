import { describe, expect, it } from "vitest";
import { levelsFor, isValidCombination, isIncludedAtNoCharge, upgradeOptions, ladderLevel } from "./service-ladders";
import { serviceLevelLabel } from "./service-engagement-labels";

describe("separate SPV and Fund ladders", () => {
  it("only valid levels per product", () => {
    expect(levelsFor("SPV_ADMINISTRATION")).toEqual(["CORE", "PLUS", "WHITE_GLOVE"]);
    expect(levelsFor("FUND_ADMINISTRATION")).toEqual(["CORE", "FUND_ADMINISTRATION", "WHITE_GLOVE", "INSTITUTIONAL"]);
    expect(isValidCombination("SPV_ADMINISTRATION", "FUND_ADMINISTRATION")).toBe(false);
    expect(isValidCombination("FUND_ADMINISTRATION", "PLUS")).toBe(false);
  });
  it("SPV Core is free, Fund Core is not", () => {
    expect(isIncludedAtNoCharge("SPV_ADMINISTRATION", "CORE")).toBe(true);
    expect(isIncludedAtNoCharge("FUND_ADMINISTRATION", "CORE")).toBe(false);
  });
  it("upgrades stay inside their product", () => {
    expect(upgradeOptions("SPV_ADMINISTRATION", "PLUS")).toEqual(["WHITE_GLOVE"]);
    expect(upgradeOptions("FUND_ADMINISTRATION", "CORE")).toEqual(["FUND_ADMINISTRATION", "WHITE_GLOVE", "INSTITUTIONAL"]);
  });
  it("names come from product + level", () => {
    expect(serviceLevelLabel("CORE", "SPV_ADMINISTRATION")).toEqual({ name: "SPV Core", positioning: "Essential SPV Infrastructure" });
    expect(serviceLevelLabel("CORE", "FUND_ADMINISTRATION").name).toBe("Fund Core");
    expect(ladderLevel("FUND_ADMINISTRATION", "WHITE_GLOVE")?.positioning).toBe("Managed Fund Operations");
  });
});
