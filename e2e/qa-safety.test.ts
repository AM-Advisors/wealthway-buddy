import { describe, expect, it } from "vitest";
import { assertQaEvidence, parseQaSession, type QaEvidence } from "./qa-safety";
const evidence: QaEvidence = { origin: "https://qa.example.test", backendId: "synthetic-qa", reviewedBy: "synthetic-reviewer", reviewedAt: new Date().toISOString(), dataIsolated: true, syntheticUserIds: ["synthetic-user"] };
const actual = { environment: "development", supabase_project_id: "synthetic-qa" };
const token = (issuer: string, sub = "synthetic-user") => `header.${btoa(JSON.stringify({ iss: issuer, sub, exp: Math.floor(Date.now() / 1000) + 3600 }))}.synthetic-signature`;
const session = (issuer = "https://synthetic-qa.supabase.co/auth/v1") => JSON.stringify({ storage_key: "sb-synthetic-qa-auth-token", session: { access_token: token(issuer), refresh_token: "synthetic-refresh", user: { id: "synthetic-user" } } });
describe("fail-closed QA preflight (offline only)", () => {
  it("blocks production backend even with a QA preview URL", () => {
    expect(() => assertQaEvidence(evidence, { environment: "production", supabase_project_id: "cvqvbmfcckeguxpoyyzj" }, evidence.origin)).toThrow("BLOCKED");
  });
  it("blocks missing evidence and mismatched backend identity", () => {
    expect(() => assertQaEvidence(undefined, actual, evidence.origin)).toThrow("BLOCKED");
    expect(() => assertQaEvidence(evidence, { ...actual, supabase_project_id: "other" }, evidence.origin)).toThrow("BLOCKED");
  });
  it("blocks missing data isolation, stale review, and production hostnames", () => {
    expect(() => assertQaEvidence({ ...evidence, dataIsolated: false }, actual, evidence.origin)).toThrow("BLOCKED");
    expect(() => assertQaEvidence({ ...evidence, reviewedAt: "2020-01-01" }, actual, evidence.origin)).toThrow("BLOCKED");
    expect(() => assertQaEvidence({ ...evidence, origin: "https://app.harmonious.co" }, actual, "https://app.harmonious.co")).toThrow("BLOCKED");
  });
  it("allows agreeing synthetic evidence, not inferred URL isolation", () => {
    expect(assertQaEvidence(evidence, actual, evidence.origin)).toBe(evidence);
  });
  it("required sessions block instead of skipping", () => {
    expect(() => parseQaSession(undefined, evidence)).toThrow("BLOCKED");
    expect(() => parseQaSession("{}", evidence)).toThrow("BLOCKED");
    expect(() => parseQaSession(session("https://other.supabase.co/auth/v1"), evidence)).toThrow("BLOCKED");
  });
  it("accepts only sessions bound to the synthetic allowlist", () => {
    expect(parseQaSession(session(), evidence).session.user.id).toBe("synthetic-user");
    expect(() => parseQaSession(session(), { ...evidence, syntheticUserIds: ["someone-else"] })).toThrow("BLOCKED");
  });
});