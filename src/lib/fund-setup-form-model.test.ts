import { describe, it, expect } from "vitest";
import { changedBySection } from "./fund-setup-form-model";
describe("changedBySection", () => {
  it("groups only changed, non-empty, saveable fields", () => {
    const r = changedBySection({ displayName: "A", legalName: "Same", carryPercent: "20", country: "X", jurisdiction: " " }, { legalName: "Same" });
    expect(r).toEqual({ fund_details: { displayName: "A" }, fees_team: { carryPercent: "20" } });
  });
});
