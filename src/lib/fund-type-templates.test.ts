import { describe, expect, it } from "vitest";
import { templatesForFundType, modelSourcesForFundType } from "./fund-type-templates";

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
  const funds = [
    { id: "equity", title: "Equity LPA", fundTypes: ["Private equity"], approvedVersion: 1 },
    { id: "debt", title: "Credit PPM", fundTypes: ["Private credit"], approvedVersion: 1 },
    { id: "re", title: "Property fund OA", fundTypes: ["Real estate"], approvedVersion: 1 },
    { id: "pending", title: "Pending equity", fundTypes: ["Private equity"], approvedVersion: null },
    ...t,
  ];
  it("assigns equity fund documents without SPV or unapproved documents", () => {
    expect(templatesForFundType(funds, "private_equity").map((x) => x.id)).toEqual(["equity"]);
  });
  it("assigns debt fund documents to private credit", () => {
    expect(templatesForFundType(funds, "Debt").map((x) => x.id)).toEqual(["debt"]);
  });
  it("assigns real estate fund documents without other fund types", () => {
    expect(templatesForFundType(funds, "Real estate fund").map((x) => x.id)).toEqual(["re"]);
  });
  it("does not offer equity publisher models as debt or real estate templates", () => {
    expect(modelSourcesForFundType("Private equity")).toHaveLength(2);
    expect(modelSourcesForFundType("Private credit")).toEqual([]);
    expect(modelSourcesForFundType("Real estate")).toEqual([]);
  });
});
