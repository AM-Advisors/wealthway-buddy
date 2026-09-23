import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  canInvestorOpen,
  canReviewGovernmentId,
  evaluateIdEvidence,
  isAllowedIdFile,
  providerSatisfiesId,
  requiredSides,
  statusAfterReplacement,
} from "./government-id";
import { capabilitiesFor } from "./ops-capabilities";

const today = new Date("2026-09-23T12:00:00Z");
const base = {
  documentType: "drivers_license",
  documentNumber: "D1234567",
  issuingCountry: "United States",
  expiration: "2030-01-01",
  userId: "u1",
  applicationId: "a1",
  today,
};
const up = (side: string, extra: Partial<Record<string, string>> = {}) => ({
  id: side, side, documentType: "drivers_license", status: "active", userId: "u1", applicationId: "a1", ...extra,
});

describe("government ID evidence", () => {
  it("blocks KYC without any ID evidence", () => {
    const r = evaluateIdEvidence({ ...base, uploads: [] });
    expect(r.ok).toBe(false);
    expect(r.missingSides).toEqual(["front", "back"]);
  });

  it("driver's license needs front and back", () => {
    expect(requiredSides("drivers_license")).toEqual(["front", "back"]);
    expect(evaluateIdEvidence({ ...base, uploads: [up("front")] }).missingSides).toEqual(["back"]);
    expect(evaluateIdEvidence({ ...base, uploads: [up("front"), up("back")] }).ok).toBe(true);
  });

  it("passport needs only the identification page", () => {
    expect(requiredSides("passport")).toEqual(["passport_page"]);
    const r = evaluateIdEvidence({
      ...base, documentType: "passport",
      uploads: [up("passport_page", { documentType: "passport" })],
    });
    expect(r.ok).toBe(true);
  });

  it("rejects an expired ID and missing fields", () => {
    const r = evaluateIdEvidence({ ...base, expiration: "2025-01-01", uploads: [up("front"), up("back")] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/expired/);
    expect(evaluateIdEvidence({ ...base, issuingCountry: "", uploads: [up("front"), up("back")] }).ok).toBe(false);
  });

  it("ignores uploads belonging to another person, another check, superseded or pending", () => {
    for (const bad of [{ userId: "u2" }, { applicationId: "a2" }, { status: "superseded" }, { status: "pending" }]) {
      expect(evaluateIdEvidence({ ...base, uploads: [up("front", bad), up("back")] }).ok).toBe(false);
    }
  });

  it("only accepts PDF, JPG, JPEG, PNG under 10 MB", () => {
    expect(isAllowedIdFile("image/png", 1000, "id.png")).toBeNull();
    expect(isAllowedIdFile("image/gif", 1000, "id.gif")).not.toBeNull();
    expect(isAllowedIdFile("image/png", 11 * 1024 * 1024, "id.png")).not.toBeNull();
  });
});

describe("Didit-captured ID", () => {
  const didit = { provider: "didit", documentType: "passport", status: "approved", documentExpired: false };
  it("satisfies the requirement without a duplicate upload", () => {
    expect(providerSatisfiesId(didit)).toBe(true);
    const r = evaluateIdEvidence({ ...base, uploads: [], provider: didit });
    expect(r).toMatchObject({ ok: true, satisfiedBy: "provider" });
  });
  it("does not when incomplete, expired, missing a document or from a manual record", () => {
    expect(providerSatisfiesId({ ...didit, status: "pending" })).toBe(false);
    expect(providerSatisfiesId({ ...didit, documentExpired: true })).toBe(false);
    expect(providerSatisfiesId({ ...didit, documentType: null })).toBe(false);
    expect(providerSatisfiesId({ ...didit, provider: "manual" })).toBe(false);
  });
});

describe("replacement", () => {
  it("reopens review after an approval or decline", () => {
    expect(statusAfterReplacement("approved")).toBe("review");
    expect(statusAfterReplacement("declined")).toBe("review");
    expect(statusAfterReplacement("review")).toBeNull();
    expect(statusAfterReplacement("not_started")).toBeNull();
  });
});

describe("who can open an ID copy", () => {
  it("an investor opens only their own", () => {
    expect(canInvestorOpen({ userId: "u1" }, "u1")).toBe(true);
    expect(canInvestorOpen({ userId: "u1" }, "u2")).toBe(false);
  });
  it("fund managers, professionals and investors never get reviewer access", () => {
    for (const role of ["fund_manager", "professional", "investor", "user", "client_success", "tax", "finance", "executive"]) {
      expect(canReviewGovernmentId(capabilitiesFor([role]))).toBe(false);
    }
  });
  it("authorized Harmonious reviewers can", () => {
    for (const role of ["compliance", "operations", "admin", "super_admin"]) {
      expect(canReviewGovernmentId(capabilitiesFor([role]))).toBe(true);
    }
  });
});

describe("storage and server paths", () => {
  const migration = readFileSync("drizzle/migrations/0030_government_id_evidence.sql", "utf8");
  const fns = readFileSync("src/lib/government-id.functions.ts", "utf8");
  const kyc = readFileSync("src/lib/onboarding.functions.ts", "utf8");

  it("blocks direct browser access to the bucket", () => {
    expect(migration).toMatch(/as restrictive for all to authenticated, anon\s+using \(bucket_id <> 'government-ids'\)/);
    expect(fns).not.toMatch(/getPublicUrl/);
  });
  it("history is append-only and superseded files are immutable", () => {
    expect(migration).toMatch(/government_id_events_immutable BEFORE UPDATE OR DELETE/);
    expect(migration).toMatch(/Superseded government ID evidence is immutable/);
  });
  it("server chooses the storage path and short-lived links are gated", () => {
    expect(fns).toMatch(/const path = `\$\{userId\}\/\$\{app\.id\}\/\$\{crypto\.randomUUID\(\)\}/);
    expect(fns).not.toMatch(/storage_path:\s*data\./);
    expect(fns).toMatch(/requireOperations\(context, "onboarding", "review"\)/);
    expect(fns).toMatch(/createSignedUrl\(row\.storage_path, 120\)/);
    expect(fns).toMatch(/row\.user_id !== userId/);
  });
  it("KYC submission repeats the ID check on the server", () => {
    expect(kyc).toMatch(/assertIdEvidence\(/);
  });
});
