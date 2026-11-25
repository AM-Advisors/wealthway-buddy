import { describe, expect, it } from "vitest";
import { trustUsesPersonalSsn } from "@/lib/investor-onboarding-model";

describe("trust under a trustee's SSN", () => {
  it("skips the business check for a trust using a personal SSN", () => {
    expect(trustUsesPersonalSsn("trust", "ssn")).toBe(true);
  });
  it("still needs the business check for a trust with its own EIN", () => {
    expect(trustUsesPersonalSsn("trust", "ein")).toBe(false);
  });
  it("still needs the business check when no choice is saved", () => {
    expect(trustUsesPersonalSsn("trust", null)).toBe(false);
  });
  it("never applies to companies", () => {
    expect(trustUsesPersonalSsn("llc", "ssn")).toBe(false);
  });
});
