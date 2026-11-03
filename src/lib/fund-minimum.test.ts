import { describe, expect, it } from "vitest";
import { currentFundMinimum } from "./fund-minimum";

describe("current fund minimum", () => {
  it("uses Erebor's $100,000 setting rather than a stale $500,000 setup", () => {
    expect(currentFundMinimum(10_000_000, 50_000_000)).toBe(10_000_000);
  });
  it("preserves an explicit zero minimum", () => {
    expect(currentFundMinimum(0, 50_000_000)).toBe(0);
  });
  it("reads legacy setup only when the fund setting is absent", () => {
    expect(currentFundMinimum(null, 10_000_000)).toBe(10_000_000);
  });
});