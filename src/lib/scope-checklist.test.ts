import { describe, expect, it } from "vitest";
import { scopeDiff, selectAllFunds } from "./scope-checklist";

describe("fund scope checklist", () => {
  it("select all adds every fund for that role and diff lists only new ones", () => {
    const current = [{ offeringId: "a", role: "fund_manager" }];
    const ticked = selectAllFunds(current, ["a", "b", "c"], "fund_manager", true);
    expect(scopeDiff(current, ticked)).toEqual({ add: [{ offeringId: "b", role: "fund_manager" }, { offeringId: "c", role: "fund_manager" }], remove: [] });
  });
  it("unticking all removes that role only", () => {
    const current = [{ offeringId: "a", role: "fund_manager" }, { offeringId: "a", role: "signer" }];
    const ticked = selectAllFunds(current, ["a"], "fund_manager", false);
    expect(scopeDiff(current, ticked)).toEqual({ add: [], remove: [{ offeringId: "a", role: "fund_manager" }] });
  });
});
