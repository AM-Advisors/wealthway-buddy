import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { authorize, PROTECTED_PERMISSIONS, type AuthzFacts, type Grant } from "@/lib/authorize";
import { accessReviewPopulation, buildRbacEvidence, type AccessSnapshot } from "@/lib/compliance-evidence";
import {
  BASELINE_CONTROLS, dispositionProblem, evidenceReviewProblem, EVIDENCE_QUERIES, recordProblem, rightsRequestAction, stableJson, statusProblem,
} from "@/lib/compliance-model";

const F = (p: Partial<AuthzFacts> = {}): AuthzFacts => ({
  userId: "u", roles: [], staffGrants: [], customRoles: {}, managedFunds: [], investorFunds: [], investmentProfiles: [],
  clientMemberships: [], companies: [], professionalMemberships: [], delegations: [],
  authenticated: true, suspended: false, assignments: [], grants: [], roleDefinitions: [], ...p,
});
const G = (permission: string, scope_type: Grant["scope_type"] = "global", scope_id: string | null = null): Grant =>
  ({ id: permission, permission, effect: "allow", scope_type, scope_id, effective_at: "2020-01-01T00:00:00Z", expires_at: null, revoked_at: null });
const g = { type: "global" as const, id: null };
const ok = (f: AuthzFacts, p: string) => authorize(f, p, g).allowed;
const migration = readFileSync("drizzle/migrations/0052_compliance_controls_layer.sql", "utf8");
const fns = readFileSync("src/lib/compliance.functions.ts", "utf8");

describe("access to Compliance & Controls", () => {
  it("ordinary clients, investors and fund managers can't access it", () => {
    const client = F({ roles: ["client_gp"], clientMemberships: [{ id: "C1", name: "C", role: "gp", canApprove: true }], grants: [G("clients.edit", "client", "C1"), G("funds.manage_access", "fund", "F1")] });
    const investor = F({ roles: ["investor"], investorFunds: [{ id: "F1", name: "F" }] });
    for (const f of [client, investor]) expect(ok(f, "administration.controls.view")).toBe(false);
    expect(fns).toContain('need(c, "administration.controls.view")');
    expect(migration).not.toMatch(/TO (anon|authenticated)/);
  });
  it("Super Administrator administers ordinary controls but gains no raw sensitive data", () => {
    const sa = F({ roles: ["super_admin"] });
    for (const p of ["administration.controls.edit", "administration.evidence.review", "administration.privacy.manage", "administration.incidents.manage"]) expect(ok(sa, p)).toBe(true);
    for (const p of PROTECTED_PERMISSIONS) expect(ok(sa, p)).toBe(false);
  });
});

describe("immutability", () => {
  it("control versions, evidence and reviews are append-only in the database", () => {
    for (const t of ["compliance_controls", "compliance_evidence", "compliance_evidence_reviews", "compliance_access_reviews", "compliance_records"]) expect(migration).toContain(`'${t}'`);
    expect(migration).toContain("BEFORE UPDATE OR DELETE");
    expect(migration).toContain("UNIQUE (control_key, version)");
    expect(fns).not.toMatch(/\.update\(|\.delete\(|\.upsert\(/);
  });
  it("regenerating evidence supersedes rather than replaces, and reviewed evidence is preserved", () => {
    expect(fns).toContain("supersedes_id: data.supersedes_id");
    expect(evidenceReviewProblem({ reviewerId: "r", collectedBy: "c", operatorId: "o", sodRequired: true, alreadyReviewedByMe: true })).toMatch(/already reviewed/);
  });
});

const snap: AccessSnapshot = {
  users: [{ id: "a", email: "a@h.co" }, { id: "b", email: "b@h.co" }],
  roles: [{ user_id: "a", role: "super_admin" }, { user_id: "b", role: "operations" }],
  grants: [], pgrants: [], fms: [], cus: [], offerings: [], clients: [], auditEvents: [],
  assignments: [{ id: "x", user_id: "b", role_key: "fund_manager_admin", scope_type: "fund", scope_id: "F1", expires_at: null, revoked_at: null }],
};

describe("access reviews and evidence generation", () => {
  it("review snapshots don't change when permissions later change", () => {
    const frozen = JSON.parse(JSON.stringify(accessReviewPopulation("privileged", snap)));
    const before = stableJson(frozen);
    snap.roles.push({ user_id: "b", role: "super_admin" });
    expect(accessReviewPopulation("privileged", snap).length).toBe(frozen.length + 1);
    expect(stableJson(frozen)).toBe(before);
    snap.roles.pop();
  });
  it("generated evidence collection is read-only", () => {
    const before = stableJson(snap);
    for (const q of Object.keys(EVIDENCE_QUERIES)) buildRbacEvidence(q as any, snap, { start: "2026-01-01", end: "2026-12-31" });
    expect(stableJson(snap)).toBe(before);
    const body = fns.slice(fns.indexOf("export const collectRbacEvidence"), fns.indexOf("export const reviewEvidence"));
    expect(body.match(/\.insert\(/g)?.length).toBe(1);
    expect(body).toContain('"compliance_evidence"');
    expect(body).not.toMatch(/access_role_assignments|user_roles|access_permission_grants/);
  });
  it("evidence snapshot counts Super Administrators from authoritative data", () => {
    expect(buildRbacEvidence("super_admins", snap, { start: "2026-01-01", end: "2026-12-31" }).record_count).toBe(1);
  });
});

describe("separation of duties and status", () => {
  it("operator/collector can't self-review when separation is required", () => {
    expect(evidenceReviewProblem({ reviewerId: "o", collectedBy: "c", operatorId: "o", sodRequired: true, alreadyReviewedByMe: false })).toBeTruthy();
    expect(evidenceReviewProblem({ reviewerId: "c", collectedBy: "c", operatorId: null, sodRequired: true, alreadyReviewedByMe: false })).toBeTruthy();
    expect(evidenceReviewProblem({ reviewerId: "r", collectedBy: "c", operatorId: "o", sodRequired: true, alreadyReviewedByMe: false })).toBeNull();
  });
  it("operating/tested require evidence; seeded controls never claim operation", () => {
    expect(statusProblem("operating", [], null)).toBeTruthy();
    expect(statusProblem("tested", [{ id: "e", control_key: "AC-01", collected_by: "c", reviews: [] }], "e")).toMatch(/accepted/);
    expect(statusProblem("tested", [{ id: "e", control_key: "AC-01", collected_by: "c", reviews: [{ decision: "accepted", reviewer_user_id: "r" }] }], "e")).toBeNull();
    for (const c of BASELINE_CONTROLS) expect(["designed", "implemented"]).toContain(c.status);
  });
  it("one control maps to both SOC 2 and GDPR without duplication", () => {
    const ac01 = BASELINE_CONTROLS.filter((c) => c.key === "AC-01");
    expect(ac01).toHaveLength(1);
    expect(ac01[0]!.mappings.some((m) => m.startsWith("SOC 2:"))).toBe(true);
    expect(ac01[0]!.mappings.some((m) => m.startsWith("GDPR:"))).toBe(true);
  });
});

describe("registers", () => {
  it("rights requests can't directly delete protected records", () => {
    expect(rightsRequestAction("erasure", "tax")).toBe("route_to_privacy_legal_review");
    expect(rightsRequestAction("erasure", "financial")).toBe("route_to_privacy_legal_review");
    expect(fns).not.toMatch(/\.delete\(/);
  });
  it("retention hold blocks disposition", () => {
    expect(dispositionProblem({ hold: true })).toBeTruthy();
    expect(recordProblem("retention", "approved", { classification: "Restricted", basis: "SEC", period: "7y", hold: true, disposition_requested: true })).toMatch(/hold/);
  });
  it("vendor records reject credentials and secrets", () => {
    expect(recordProblem("vendor", "approved", { service: "Email", api_key: "x" } as any)).toBeTruthy();
    expect(recordProblem("vendor", "approved", { service: "Email", security_review: "sk_live_abcdef123456" })).toMatch(/secret/);
    expect(recordProblem("vendor", "approved", { service: "Email", security_review: "SOC 2 Type II 2026" })).toBeNull();
  });
  it("risk acceptance requires an identified approver", () => {
    expect(recordProblem("risk", "accepted", { owner: "a", treatment: "accept" })).toMatch(/approving person/);
    expect(recordProblem("risk", "accepted", { owner: "a", treatment: "accept", accepted_by: "b" })).toBeNull();
  });
  it("incident notification stays a human decision", () => {
    expect(recordProblem("incident", "closed", { discovered_at: "2026-01-01", notification_decision: "Pending human review" })).toMatch(/human/);
    expect(recordProblem("incident", "closed", { discovered_at: "2026-01-01", notification_decision: "Do not notify", decision_owner: "Legal" })).toBeNull();
  });
  it("exception closure requires evidence; processing approval requires a human owner", () => {
    expect(recordProblem("exception", "closed", { control_key: "AC-01", issue: "x" }, { evidenceIds: [] })).toMatch(/evidence/);
    expect(recordProblem("processing", "approved", { purpose: "x", owner: "o" })).toMatch(/privacy\/legal/);
  });
  it("tax IDs can't be copied into compliance records", () => {
    expect(recordProblem("data_map", "draft", { systems: "123-45-6789", purpose: "x", classification: "Restricted" })).toMatch(/tax ID/);
  });
});
