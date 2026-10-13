import { describe, expect, it } from "vitest";
import { countDidit, maskRef, sourceCard, stageDidit, type DiditEvent, type DiditLink } from "@/lib/source-reconciliation";

const ev = (o: Partial<DiditEvent>): DiditEvent => ({ eventId: Math.random().toString(36), type: "status.updated", sessionId: null, status: "Approved", vendorData: null, applicationId: null, receivedAt: "2026-10-01T00:00:00Z", ...o });

describe("source reconciliation", () => {
  it("never reports zero for an unavailable source", () => {
    const counts = { records: 0, confirmed: 0, probable: 0, unmatched: 0, conflicting: 0, missingEvidence: 0, errors: 0, reviewRequired: 0 };
    expect(sourceCard("wix", "not_connected", "x", counts).counts).toBeNull();
    expect(sourceCard("google_drive", "blocked", "x", counts).lastInventoryAt).toBeNull();
    expect(sourceCard("didit", "partial", "x", counts).counts).toEqual(counts);
  });
  it("groups events by session and confirms only a single person found by session reference", () => {
    const links = (e: DiditEvent): DiditLink[] => e.sessionId === "s1" ? [{ via: "session", personId: "p1", verificationId: "v1" }] : [];
    const rows = stageDidit([ev({ sessionId: "s1", status: "In Progress" }), ev({ sessionId: "s1", receivedAt: "2026-10-02T00:00:00Z" })], links);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ matchClass: "confirmed", eventCount: 2, latestOutcome: "Approved", personIds: ["p1"] });
  });
  it("flags ambiguous identities as conflicting rather than picking one", () => {
    const rows = stageDidit([ev({ sessionId: "s2" })], () => [{ via: "session", personId: "pA", verificationId: "v1" }, { via: "session", personId: "pB", verificationId: "v2" }]);
    expect(rows[0]!.matchClass).toBe("conflicting");
  });
  it("detects duplicate verifications for one person", () => {
    const rows = stageDidit([ev({ sessionId: "s3" })], () => [{ via: "session", personId: "p1", verificationId: "v1" }, { via: "session", personId: "p1", verificationId: "v2" }]);
    expect(rows[0]!.matchClass).toBe("duplicate_verification");
  });
  it("vendor-data links are only probable; uncorrelated events stay unmatched with missing evidence", () => {
    const rows = stageDidit([ev({ sessionId: "s4", vendorData: "x" }), ev({ type: "user.data.updated" })], (e) => e.vendorData ? [{ via: "vendor_data", personId: "p1", verificationId: "v1" }] : []);
    const by = Object.fromEntries(rows.map((r) => [r.sessionId ?? "none", r]));
    expect(by["s4"]!.matchClass).toBe("probable");
    expect(by["none"]).toMatchObject({ matchClass: "unmatched", verificationType: "user_profile" });
    expect(by["none"]!.missing).toContain("session reference");
  });
  it("a historical Approved outcome never becomes current eligibility", () => {
    const rows = stageDidit([ev({ sessionId: "s5" })], () => [{ via: "session", personId: "p1", verificationId: "v1" }]);
    expect(Object.keys(rows[0]!)).not.toContain("eligible");
    expect(rows[0]!.action).toMatch(/current eligibility needs its own review/);
  });
  it("review-required excludes records that already have a decision", () => {
    const rows = stageDidit([ev({ sessionId: "a" }), ev({ sessionId: "b" })], () => []);
    expect(countDidit(rows, new Set()).reviewRequired).toBe(2);
    expect(countDidit(rows, new Set([rows[0]!.ref])).reviewRequired).toBe(1);
  });
  it("masks provider references", () => {
    expect(maskRef("abcdef-1234567890")).toBe("...567890");
    expect(maskRef(null)).toBe("none");
  });
});
