import { describe, expect, it } from "vitest";
import {
  mergeVerifiedPersonFields,
  verifiedFieldsFromDecision,
  verifiedPersonBackfill,
} from "@/lib/kyc-person-backfill";
import type { NormalizedVerification } from "@/lib/kyc-verification";

const normalized = (): NormalizedVerification =>
  ({
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
    aml: { status: "approved", hits: 0, warnings: [] },
    warnings: [],
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
  }) as NormalizedVerification;

describe("verifiedPersonBackfill (fill-blank)", () => {
  it("fills blank About You fields from verified data", () => {
    const r = verifiedPersonBackfill({}, normalized(), true);
    expect(r.update["date_of_birth"]).toBe("1985-04-12");
    expect(r.update["citizenship_country"]).toBe("United States");
    expect(r.update["address_line1"]).toBe("100 Main St");
    expect(r.update["city"]).toBe("Austin");
    expect(r.filledFields).toContain("date_of_birth");
    expect(r.changes).toEqual([]);
  });

  it("never overwrites values the investor already entered", () => {
    const r = verifiedPersonBackfill(
      { date_of_birth: "1990-01-01", citizenship_country: "Canada", city: "Toronto" },
      normalized(),
      true,
    );
    expect(r.update["date_of_birth"]).toBeUndefined();
    expect(r.update["citizenship_country"]).toBeUndefined();
    expect(r.update["city"]).toBeUndefined();
    expect(r.update["address_line1"]).toBe("100 Main St");
  });

  it("fills nothing when the check is not approved", () => {
    const r = verifiedPersonBackfill({}, normalized(), false);
    expect(r.update).toEqual({});
  });

  it("skips address when proof of address was not approved", () => {
    const n = normalized();
    n.proofOfAddress = { ...n.proofOfAddress, status: "review" };
    const r = verifiedPersonBackfill({}, n, true);
    expect(r.update["address_line1"]).toBeUndefined();
    expect(r.update["date_of_birth"]).toBe("1985-04-12");
  });
});

describe("mergeVerifiedPersonFields (verified-wins)", () => {
  const fields = {
    legal_first_name: "Kimberly",
    date_of_birth: "1985-04-12",
    address_line1: "100 Main St",
    city: "Austin",
    country: "United States",
  };

  it("replaces differing values and reports each change", () => {
    const r = mergeVerifiedPersonFields(
      { date_of_birth: "1990-01-01", legal_first_name: "Kim" },
      fields,
      "verified-wins",
    );
    expect(r.update["date_of_birth"]).toBe("1985-04-12");
    expect(r.update["legal_first_name"]).toBe("Kimberly");
    expect(r.changes).toContainEqual({ field: "date_of_birth", from: "1990-01-01", to: "1985-04-12" });
    expect(r.changes).toContainEqual({ field: "legal_first_name", from: "Kim", to: "Kimberly" });
  });

  it("skips identical values and reports no change", () => {
    const r = mergeVerifiedPersonFields({ date_of_birth: "1985-04-12" }, fields, "verified-wins");
    expect(r.update["date_of_birth"]).toBeUndefined();
    expect(r.changes.find((c) => c.field === "date_of_birth")).toBeUndefined();
  });

  it("drops the whole address group when street or city is missing", () => {
    const r = mergeVerifiedPersonFields(
      {},
      { address_line1: "100 Main St", city: null, country: "United States" },
      "verified-wins",
    );
    expect(r.update["address_line1"]).toBeUndefined();
    expect(r.update["country"]).toBeUndefined();
  });
});

describe("verifiedFieldsFromDecision", () => {
  it("maps the normalized decision onto person columns", () => {
    const f = verifiedFieldsFromDecision(normalized());
    expect(f["date_of_birth"]).toBe("1985-04-12");
    expect(f["citizenship_country"]).toBe("United States");
    expect(f["postal_code"]).toBe("78701");
  });
});
