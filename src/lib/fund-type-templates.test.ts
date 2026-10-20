import { describe, expect, it } from "vitest";
import { templatesForFundType } from "./fund-type-templates";

const t = [
  { id: "oa", title: "SPV OA", fundTypes: ["SPV", "Single asset SPV"], approvedVersion: 1 },
  { id: "ppm", title: "SPV PPM", fundTypes: ["SPV"], approvedVersion: null },
  { id: "vc", title: "VC LPA", fundTypes: ["Venture capital"], approvedVersion: 2 },
];
describe("templates by fund type", () => {
  it("returns only approved templates assigned to the fund's type", () => {
    expect(templatesForFundType(t, "spv").map((x) => x.id)).toEqual(["oa"]);
  });
  it("returns nothing when the fund has no type", () => {
    expect(templatesForFundType(t, null)).toEqual([]);
  });
});
