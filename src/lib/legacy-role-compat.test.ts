import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { authorize, templateFor, type AuthzFacts, type Assignment } from "@/lib/authorize";
import { dryRun, LEGACY_CLIENT_ACTIONS, MANUAL_REVIEW, ORPHAN_READONLY } from "@/lib/legacy-role-compat";
import { shadowCategory, shadowCompare } from "@/lib/authz-shadow";

const F = (p: Partial<AuthzFacts> = {}): AuthzFacts => ({
  userId: "11111111-1111-1111-1111-111111111111", roles: [], staffGrants: [], customRoles: {}, managedFunds: [], investorFunds: [], investmentProfiles: [],
  clientMemberships: [], companies: [], professionalMemberships: [], delegations: [],
  authenticated: true, suspended: false, assignments: [], grants: [], roleDefinitions: [], ...p,
});
const A = (p: Partial<Assignment>): Assignment => ({ id: "a", role_key: "client_principal", role_version: null, scope_type: "client", scope_id: "C1", effective_at: "2020-01-01T00:00:00Z", expires_at: null, revoked_at: null, ...p });
const C1 = { type: "client" as const, id: "C1" };

describe("Client Principal / GP", () => {
  const f = F({ assignments: [A({})] });
  it("preserves exactly today's client_gp actions", () => {
    expect([...templateFor("client_principal")!.permissions].sort()).toEqual([...LEGACY_CLIENT_ACTIONS.client_gp].sort());
    for (const p of ["companies.edit", "companies.approve", "clients.prepare", "clients.view"]) expect(authorize(f, p, C1).allowed).toBe(true);
  });
  it("has no user/RBAC management, money or global access", () => {
    for (const p of ["clients.manage_access", "companies.manage_access", "administration.manage_access", "capital.execute", "tax.view"]) expect(authorize(f, p, C1).allowed).toBe(false);
    expect(authorize(f, "clients.view", { type: "client", id: "C2" }).allowed).toBe(false);
    expect(authorize(f, "clients.view", { type: "global", id: null }).allowed).toBe(false);
  });
});

describe("Client Viewer", () => {
  it("matches client_readonly exactly and can't edit", () => {
    expect([...templateFor("client_viewer")!.permissions].sort()).toEqual([...LEGACY_CLIENT_ACTIONS.client_readonly].sort());
    const f = F({ assignments: [A({ role_key: "client_viewer" })] });
    expect(authorize(f, "clients.view", C1).allowed).toBe(true);
    for (const p of ["clients.edit", "companies.edit", "documents.edit", "clients.approve"]) expect(authorize(f, p, C1).allowed).toBe(false);
  });
});

describe("no-scope rule", () => {
  it("scoped role with missing or wrong scope grants nothing; null is never global", () => {
    expect(authorize(F({ assignments: [A({ scope_id: null })] }), "clients.view", C1).allowed).toBe(false);
    expect(authorize(F({ assignments: [A({ scope_id: null })] }), "clients.view", { type: "client", id: null }).allowed).toBe(false);
    expect(authorize(F({ assignments: [A({ scope_type: "global", scope_id: null })] }), "clients.view", C1).allowed).toBe(false);
    expect(authorize(F({ grants: [{ id: "g", permission: "clients.view", effect: "allow", scope_type: "client", scope_id: null, effective_at: "2020-01-01T00:00:00Z", expires_at: null, revoked_at: null }] }), "clients.view", C1).allowed).toBe(false);
  });
  it("orphan client_readonly is not migrated and is flagged", () => {
    const rows = dryRun({ userId: "u", person: "P", legacyRole: "client_readonly", clients: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.result).toBe(MANUAL_REVIEW);
    expect(rows[0]!.note).toBe(ORPHAN_READONLY);
    expect(rows[0]!.proposedScope).toBeNull();
  });
  it("client_gp with a matching client is equivalent (no added, no lost)", () => {
    const [r] = dryRun({ userId: "u", person: "P", legacyRole: "client_gp", clients: [{ id: "C1", name: "Acme", role: "client_gp" }] });
    expect(r!.added).toEqual([]);
    expect(r!.lost).toEqual([]);
    expect(r!.result).not.toBe(MANUAL_REVIEW);
  });
  it("dry run never writes", () => {
    const src = readFileSync("src/lib/access-admin.functions.ts", "utf8");
    const block = src.slice(src.indexOf("export const getLegacyCompatibility"));
    expect(block).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });
});

describe("Harmonious timed access", () => {
  it("expiring staff RBAC assignment expires", () => {
    const live = F({ assignments: [A({ role_key: "finance", scope_type: "global", scope_id: null, expires_at: "2999-01-01T00:00:00Z" })] });
    const dead = F({ assignments: [A({ role_key: "finance", scope_type: "global", scope_id: null, expires_at: "2021-01-01T00:00:00Z" })] });
    const perm = templateFor("finance")!.permissions[0]!;
    expect(authorize(live, perm, { type: "global", id: null }).allowed).toBe(true);
    expect(authorize(dead, perm, { type: "global", id: null }).allowed).toBe(false);
  });
  it("legacy platform roles stay unchanged — timed access doesn't write user_roles", () => {
    const src = readFileSync("src/lib/access-admin.functions.ts", "utf8");
    expect(src).toContain("if (t?.platformRole && !timed)");
    expect(src).toContain("can't be timed");
  });
});

describe("shadow authorization", () => {
  it("RBAC can never override legacy", () => {
    const allowAll = F({ roles: ["super_admin"] });
    expect(shadowCompare({ endpoint: "x", legacyAllowed: false, facts: allowAll, permission: "funds.view", resource: { type: "global", id: null } }).allowed).toBe(false);
    expect(shadowCompare({ endpoint: "x", legacyAllowed: true, facts: F(), permission: "funds.view", resource: { type: "global", id: null } }).allowed).toBe(true);
    expect(shadowCategory(false, true)).toBe("legacy_deny_rbac_allow");
    expect(shadowCategory(true, false)).toBe("legacy_allow_rbac_deny");
  });
  it("records hold no restricted data", () => {
    const { record } = shadowCompare({ endpoint: "tax.getReturn", legacyAllowed: true, facts: F(), permission: "funds.view", resource: { type: "fund", id: "123-45-6789", label: "John Smith SSN 123-45-6789" } });
    expect(Object.keys(record).sort()).toEqual(["actor_user_id", "canonical_allowed", "canonical_reason", "category", "endpoint", "legacy_allowed", "permission", "resource_id", "resource_type"]);
    expect(JSON.stringify(record)).not.toContain("John");
    expect(JSON.stringify(record)).not.toContain("123-45-6789");
  });
});
