import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { accessChangeProblem, authorize, isProtected, PROTECTED_PERMISSIONS, ROLE_TEMPLATES, type AuthzFacts, type Grant } from "@/lib/authorize";
import { visibleScreens } from "@/lib/ops-capabilities";

const F = (p: Partial<AuthzFacts> = {}): AuthzFacts => ({
  userId: "me", roles: [], staffGrants: [], customRoles: {}, managedFunds: [], investorFunds: [], investmentProfiles: [],
  clientMemberships: [], companies: [], professionalMemberships: [], delegations: [],
  authenticated: true, suspended: false, assignments: [], grants: [], roleDefinitions: [], ...p,
});
const G = (p: Partial<Grant>): Grant => ({ id: "g", permission: "funds.view", effect: "allow", scope_type: "fund", scope_id: "A", effective_at: "2020-01-01T00:00:00Z", expires_at: null, revoked_at: null, ...p });
const fundA = { type: "fund" as const, id: "A", label: "Fund A", ancestors: [{ type: "client" as const, id: "C1" }] };
const fundB = { type: "fund" as const, id: "B", label: "Fund B", ancestors: [{ type: "client" as const, id: "C2" }] };
const g = { type: "global" as const, id: null };
const superAdmin = F({ userId: "sa", roles: ["super_admin"] });
const ops = F({ userId: "ops", roles: ["operations"] });

describe("canonical resolver", () => {
  it("email domain grants nothing; super admin must be explicitly assigned", () => {
    const f = F({ userId: "alice@harmonious.co" });
    expect(authorize(f, "funds.view", g).allowed).toBe(false);
    expect(authorize(f, "administration.manage_access", g).allowed).toBe(false);
    expect(authorize(superAdmin, "administration.manage_access", g).allowed).toBe(true);
  });
  it("suspended and unauthenticated users fail", () => {
    expect(authorize({ ...superAdmin, suspended: true }, "funds.view", g).allowed).toBe(false);
    expect(authorize({ ...superAdmin, authenticated: false }, "funds.view", g).allowed).toBe(false);
  });
  it("direct grant works in scope and fails outside it", () => {
    const f = F({ grants: [G({})] });
    const ok = authorize(f, "funds.view", fundA);
    expect(ok.allowed).toBe(true);
    expect(ok.sources).toContain("Direct grant");
    const no = authorize(f, "funds.view", fundB);
    expect(no.allowed).toBe(false);
    expect(no.reason).toMatch(/outside assigned scope/);
  });
  it("expired, future and revoked grants fail", () => {
    expect(authorize(F({ grants: [G({ expires_at: "2021-01-01T00:00:00Z" })] }), "funds.view", fundA).allowed).toBe(false);
    expect(authorize(F({ grants: [G({ effective_at: "2999-01-01T00:00:00Z" })] }), "funds.view", fundA).allowed).toBe(false);
    expect(authorize(F({ grants: [G({ revoked_at: "2024-01-01T00:00:00Z" })] }), "funds.view", fundA).allowed).toBe(false);
  });
  it("explicit deny overrides role grants, including Super Administrator", () => {
    const f = { ...superAdmin, grants: [G({ effect: "deny", permission: "funds.view" })] };
    expect(authorize(f, "funds.view", fundA).allowed).toBe(false);
    expect(authorize(f, "funds.view", fundB).allowed).toBe(true);
  });
  it("client-scoped role covers that client's funds only", () => {
    const f = F({ assignments: [{ id: "a", role_key: "client_administrator", role_version: null, scope_type: "client", scope_id: "C1", effective_at: "2020-01-01T00:00:00Z", expires_at: null, revoked_at: null }] });
    expect(authorize(f, "clients.edit", { type: "client", id: "C1" }).allowed).toBe(true);
    expect(authorize(f, "clients.edit", { type: "client", id: "C2" }).allowed).toBe(false);
    expect(authorize(f, "funds.view", fundA).allowed).toBe(true);
    expect(authorize(f, "funds.view", fundB).allowed).toBe(false);
  });
  it("fund manager stays fund-specific", () => {
    const f = F({ roles: ["fund_manager"], managedFunds: [{ id: "A", name: "Fund A" }] });
    expect(authorize(f, "funds.view", fundA).allowed).toBe(true);
    expect(authorize(f, "funds.view", fundB).allowed).toBe(false);
    expect(authorize(f, "funds.view", g).allowed).toBe(false);
  });
  it("investor stays profile-specific", () => {
    const f = F({ roles: ["investor"], investmentProfiles: [{ id: "P1", label: "Mine", status: null }] });
    const own = authorize(f, "investors.view", { type: "investment_profile", id: "P1" });
    expect(own.allowed).toBe(true);
    expect(authorize(f, "investors.view", { type: "investment_profile", id: "P2" }).allowed).toBe(false);
  });
  it("professional needs an accepted live delegation; revocation fails immediately", () => {
    const d = { id: "d", direction: "acting_for" as const, counterpart: "X", scope_type: "investment_profile", scope_id: "P", authority_level: "view", status: "active", acceptance_state: "accepted", expires_at: null, revoked_at: null, capabilities: ["view_documents"] };
    const r = { type: "investment_profile" as const, id: "P" };
    expect(authorize(F({ delegations: [d] }), "documents.view", r).allowed).toBe(true);
    expect(authorize(F({ delegations: [{ ...d, acceptance_state: "pending" }] }), "documents.view", r).allowed).toBe(false);
    expect(authorize(F({ delegations: [{ ...d, revoked_at: "2026-01-01" }] }), "documents.view", r).allowed).toBe(false);
  });
  it("protected permissions can't be granted or resolved generically", () => {
    for (const p of PROTECTED_PERMISSIONS) {
      expect(authorize({ ...superAdmin, grants: [G({ permission: p, scope_type: "global", scope_id: null })] }, p, g).allowed).toBe(false);
      expect(accessChangeProblem(superAdmin, { kind: "grant", targetUserId: "x", permission: p, effect: "allow", scope: g })).toMatch(/Protected/);
    }
    for (const t of ROLE_TEMPLATES) expect(t.permissions.some(isProtected)).toBe(false);
  });
  it("maker/checker still applies — approver can't approve their own item", () => {
    const d = authorize(superAdmin, "funds.approve", fundA, { preparedBy: "sa" });
    expect(d.allowed).toBe(false);
    expect(d.protectedConditions).toContain("maker_checker");
    expect(authorize(superAdmin, "funds.approve", fundA, { preparedBy: "other" }).protectedConditions).toContain("maker_checker");
    expect(authorize(superAdmin, "capital.execute", g).protectedConditions).toContain("dual_control_money_movement");
  });
});

describe("access changes — no privilege escalation", () => {
  it("ordinary staff can't grant Super Admin; only super admins can", () => {
    expect(accessChangeProblem(ops, { kind: "assign_role", targetUserId: "x", roleKey: "super_admin", scope: g })).toBeTruthy();
    expect(accessChangeProblem(F({ userId: "ad", roles: ["admin"] }), { kind: "assign_role", targetUserId: "x", roleKey: "super_admin", scope: g })).toBeTruthy();
    expect(accessChangeProblem(superAdmin, { kind: "assign_role", targetUserId: "x", roleKey: "super_admin", scope: g })).toBeNull();
    expect(accessChangeProblem(F({ userId: "ad", roles: ["admin"] }), { kind: "assign_role", targetUserId: "x", roleKey: "tax", scope: g })).toBeTruthy();
  });
  it("no one can self-promote or self-grant", () => {
    expect(accessChangeProblem(superAdmin, { kind: "assign_role", targetUserId: "sa", roleKey: "super_admin", scope: g })).toBeTruthy();
    expect(accessChangeProblem(superAdmin, { kind: "grant", targetUserId: "sa", permission: "funds.view", effect: "allow", scope: g })).toBeTruthy();
    expect(accessChangeProblem(superAdmin, { kind: "account_state", targetUserId: "sa", suspended: false })).toBeTruthy();
  });
  it("platform-wide access administration is Super Administrator-only", () => {
    const admin = F({ userId: "ad", roles: ["admin"] });
    expect(accessChangeProblem(admin, { kind: "grant", targetUserId: "x", permission: "administration.manage_access", effect: "allow", scope: g })).toMatch(/Super Administrator/);
  });
  it("fund manager admin manages only their fund, and only what they hold", () => {
    const fma = F({ userId: "fm", assignments: [{ id: "a", role_key: "fund_manager_admin", role_version: null, scope_type: "fund", scope_id: "A", effective_at: "2020-01-01T00:00:00Z", expires_at: null, revoked_at: null }] });
    expect(accessChangeProblem(fma, { kind: "assign_role", targetUserId: "x", roleKey: "fund_viewer", scope: { type: "fund", id: "A" } })).toBeNull();
    expect(accessChangeProblem(fma, { kind: "assign_role", targetUserId: "x", roleKey: "fund_viewer", scope: { type: "fund", id: "B" } })).toBeTruthy();
    expect(accessChangeProblem(fma, { kind: "assign_role", targetUserId: "x", roleKey: "fund_approver", scope: { type: "fund", id: "A" } })).toMatch(/exceeds/);
    expect(accessChangeProblem(fma, { kind: "assign_role", targetUserId: "x", roleKey: "operations", scope: g })).toBeTruthy();
  });
  it("client administrator manages only their client", () => {
    const ca = F({ userId: "ca", assignments: [{ id: "a", role_key: "client_administrator", role_version: null, scope_type: "client", scope_id: "C1", effective_at: "2020-01-01T00:00:00Z", expires_at: null, revoked_at: null }] });
    expect(accessChangeProblem(ca, { kind: "assign_role", targetUserId: "x", roleKey: "client_viewer", scope: { type: "client", id: "C1" } })).toBeNull();
    expect(accessChangeProblem(ca, { kind: "assign_role", targetUserId: "x", roleKey: "client_viewer", scope: { type: "client", id: "C2" } })).toBeTruthy();
  });
});

describe("wiring", () => {
  const admin = readFileSync("src/lib/access-admin.functions.ts", "utf8");
  const mig = readFileSync("drizzle/migrations/0050_rbac_stage2_canonical_access.sql", "utf8");
  it("every mutation is gated, audited with before/after, and refusals are audited", () => {
    expect(admin.match(/await gate\(/g)!.length).toBeGreaterThanOrEqual(6);
    expect(admin).toContain('outcome: "denied"');
    expect(admin).toMatch(/previous: before/);
    expect(admin).toContain("last Super Administrator");
  });
  it("audit and role versions are immutable; grants are revoke-only", () => {
    expect(mig).toContain("access audit events are immutable");
    expect(mig).toMatch(/access_role_definitions_immutable BEFORE UPDATE OR DELETE/);
    expect(mig).toContain("only revocation");
    expect(mig).not.toMatch(/GRANT[^;]*TO (anon|authenticated)/);
  });
  it("Access Control link only shows when allowed", () => {
    const s = [{ url: "/ops/access-control" }, { url: "/ops/other" }];
    expect(visibleScreens(s, { accessControl: false }).map((x) => x.url)).toEqual(["/ops/other"]);
    expect(visibleScreens(s, { accessControl: true })).toHaveLength(2);
  });
  it("legacy enforcement doesn't import the canonical resolver yet", () => {
    for (const f of ["src/lib/ops-capabilities.ts", "src/lib/staff-rbac.server.ts", "src/lib/session-resolution.ts"]) {
      expect(readFileSync(f, "utf8")).not.toContain("@/lib/authorize");
    }
  });
});
