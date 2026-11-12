import { describe, expect, it } from "vitest";
import { brandProblems } from "./marketing-brand";

describe("marketing brand check", () => {
  it("does not block dollar amounts", () => {
    expect(brandProblems("A $500,000 commitment with a $100,000 call")).toEqual([]);
  });
  it("does not block pricing or fee wording", () => {
    expect(brandProblems("Our pricing starts at $2,500 per month with a discount")).toEqual([]);
  });
  it("still blocks offshore mentions", () => {
    expect(brandProblems("Set up in the Cayman Islands")).toHaveLength(1);
  });
});
