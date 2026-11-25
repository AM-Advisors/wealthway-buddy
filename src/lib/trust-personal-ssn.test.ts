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

import { trustSignerVerified } from "@/lib/investor-onboarding-model";
describe("trust verified through one signer", () => {
  const now = "2026-11-25T00:00:00Z";
  it("one verified signer is enough even when another trustee is unverified", () => {
    expect(trustSignerVerified("trust", [{ signer: true, kycStatus: "approved" }, { signer: false, kycStatus: "not_started" }], now)).toBe(true);
  });
  it("an unverified signer is not enough", () => {
    expect(trustSignerVerified("trust", [{ signer: true, kycStatus: "not_started" }, { signer: false, kycStatus: "approved" }], now)).toBe(false);
  });
  it("does not apply to companies", () => {
    expect(trustSignerVerified("llc", [{ signer: true, kycStatus: "approved" }], now)).toBe(false);
  });
});
