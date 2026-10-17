import { describe, expect, it } from "vitest";
import { bankOwnerMatches } from "./bank-name-match";

describe("bankOwnerMatches", () => {
  it("matches the investor's name with a middle name and Jr. on the bank side", () => {
    expect(bankOwnerMatches(["THOMAS A MORGAN JR"], ["Thomas Morgan Jr."])).toBe(true);
  });
  it("matches an entity regardless of LLC punctuation", () => {
    expect(bankOwnerMatches(["Corps Erebor, LLC"], ["CORPS EREBOR LLC"])).toBe(true);
  });
  it("rejects a different person", () => {
    expect(bankOwnerMatches(["Jane Smith"], ["Thomas Morgan"])).toBe(false);
  });
  it("never matches empty names", () => {
    expect(bankOwnerMatches([], ["Thomas Morgan"])).toBe(false);
    expect(bankOwnerMatches(["Thomas Morgan"], [""])).toBe(false);
  });
});
