import { describe, expect, it } from "vitest";
import { profileTaxIdType } from "./trust-tax-id";

describe("trust tax ID choice", () => {
  it("accepts a trustee SSN rather than forcing an EIN", () => {
    expect(profileTaxIdType("trust", "ssn", "ein", "900001234")).toBe("ssn");
  });
  it("accepts a separate EIN even when its digits start with 9", () => {
    expect(profileTaxIdType("trust", "ein", "ssn", "900001234")).toBe("ein");
  });
  it("preserves a trust's saved SSN choice when replacing the number", () => {
    expect(profileTaxIdType("trust", undefined, "ssn", "900001234")).toBe("ssn");
  });
  it("does not reinterpret existing EIN-based trusts", () => {
    expect(profileTaxIdType("trust", undefined, "ein", "900001234")).toBe("ein");
  });
  it("keeps other businesses EIN-only", () => {
    expect(() => profileTaxIdType("entity", "ssn", null, "100001234")).toThrow("EIN");
  });
  it("locks a saved trust choice against switching", () => {
    expect(() => profileTaxIdType("trust", "ein", "ssn", "123456789", { locked: true })).toThrow("locked");
  });
  it("still allows replacing the number with the same locked type", () => {
    expect(profileTaxIdType("trust", "ssn", "ssn", "123456789", { locked: true })).toBe("ssn");
  });
});
