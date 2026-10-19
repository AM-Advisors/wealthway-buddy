import { describe, expect, it } from "vitest";
import { kycFieldsFor, sanitizeKycInput } from "./kyc-fields";

describe("KYC/KYB fields for a new investment profile", () => {
  it("asks an individual for date of birth and tax ID", () => {
    const keys = kycFieldsFor("individual", false).map((f) => f.key);
    expect(keys).toContain("date_of_birth");
    expect(keys).toContain("tax_id");
  });
  it("asks an LLC for owners of 25% or more and EIN", () => {
    const keys = kycFieldsFor("llc", false).map((f) => f.key);
    expect(keys).toContain("beneficial_owners");
    expect(keys).not.toContain("date_of_birth");
  });
  it("asks nothing when the profile is already verified", () => {
    expect(kycFieldsFor("trust", true)).toEqual([]);
  });
  it("keeps only the last four digits of a tax ID", () => {
    const r = sanitizeKycInput("individual", { tax_id: "123-45-6789" });
    expect(r.taxLast4).toBe("6789");
    expect(JSON.stringify(r)).not.toContain("123-45");
  });
});
