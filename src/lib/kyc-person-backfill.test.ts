import { describe, expect, it } from "vitest";
import { verifiedPersonBackfill } from "@/lib/kyc-person-backfill";
import type { NormalizedVerification } from "@/lib/kyc-verification";

const normalized = (overrides: Partial<NormalizedVerification> = {}): NormalizedVerification => ({
  providerDecision: "Approved",
  providerStatus: "approved",
  sessionId: "s1",
  vendorData: null,
  document: {
    status: "approved",
    documentType: "passport",
    issuingCountry: "United States",
    issuingRegion: null,
    issueDate: null,
    expirationDate: null,
    numberLast4: "1234",
    verifiedName: "Kimberly Girardi",
    dateOfBirth: "1985-04-12",
    warnings: [],
  },
  liveness: { status: "approved", warnings: [] },
  faceMatch: { status: "approved", score: 0.99, warnings: [] },
  proofOfAddress: {
    status: "approved",
    extracted: {
      line1: "100 Main St",
      city: "Austin",
      region: "TX",
      postalCode: "78701",
      country: "United States",
      formatted: null,
    },
    documentType: "utility_bill",
    issueDate: null,
    name: null,
    warnings: [],
  },
  ...overrides,
} as NormalizedVerification);

describe("verifiedPersonBackfill", () => {
  it("fills blank About You fields from verified data", () => {
    const r = verifiedPersonBackfill({}, normalized(), true);
    expect(r.update.date_of_birth).toBe("1985-04-12");
    expect(r.update.citizenship_country).toBe("United States");
    expect(r.update.address_line1).toBe("100 Main St");
    expect(r.update.city).toBe("Austin");
    expect(r.filledFields).toContain("date_of_birth");
  });

  it("never overwrites values the investor already entered", () => {
    const r = verifiedPersonBackfill(
      { date_of_birth: "1990-01-01", citizenship_country: "Canada", city: "Toronto" },
      normalized(),
      true,
    );
    expect(r.update.date_of_birth).toBeUndefined();
    expect(r.update.citizenship_country).toBeUndefined();
    expect(r.update.city).toBeUndefined();
    expect(r.update.address_line1).toBe("100 Main St");
  });

  it("fills nothing when the check is not approved", () => {
    const r = verifiedPersonBackfill({}, normalized(), false);
    expect(r.update).toEqual({});
    expect(r.filledFields).toEqual([]);
  });

  it("skips address when proof of address was not approved", () => {
    const n = normalized();
    n.proofOfAddress = { ...n.proofOfAddress, status: "review" };
    const r = verifiedPersonBackfill({}, n, true);
    expect(r.update.address_line1).toBeUndefined();
    expect(r.update.date_of_birth).toBe("1985-04-12");
  });
});
