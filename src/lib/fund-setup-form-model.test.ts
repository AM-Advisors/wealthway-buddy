import { describe, it, expect } from "vitest";
import { changedBySection } from "./fund-setup-form-model";
describe("changedBySection", () => {
  it("groups only changed, non-empty, saveable fields", () => {
    const r = changedBySection({ displayName: "A", legalName: "Same", carryPercent: "20", country: "X", jurisdiction: " " }, { legalName: "Same" });
    expect(r).toEqual({ fund_details: { displayName: "A" }, fees_team: { carryPercent: "20" } });
  });
});
import { FORM_SECTIONS } from "./fund-setup-form-model";
describe("FORM_SECTIONS", () => {
  it("puts name, raise and minimum under Fund Details with no duplicate keys", () => {
    const details = FORM_SECTIONS.find((s) => s.id === "details")!.fields.map((f) => f.key);
    expect(details.slice(0, 3)).toEqual(["displayName", "targetRaise", "minInvestment"]);
    const all = FORM_SECTIONS.flatMap((s) => s.fields.map((f) => f.key));
    expect(new Set(all).size).toBe(all.length);
  });
});
