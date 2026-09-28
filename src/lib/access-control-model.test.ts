import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  activeDelegation,
  applyDenies,
  effectivePermissions,
  matrix,
  sensitiveAccess,
  userTypes,
  type Facts,
} from "@/lib/access-control-model";

const blank = (p: Partial<Facts>): Facts => ({
  userId: "u", roles: [], staffGrants: [], customRoles: {}, managedFunds: [], investorFunds: [],
  investmentProfiles: [], clientMemberships: [], companies: [], professionalMemberships: [], delegations: [], ...p,
});
const has = (f: Facts, area: string, action: string, scopeType?: string, id?: string) =>
  effectivePermissions(f).some((p) => p.area === area && p.action === action && (!scopeType || p.scope.type === scopeType) && (!id || p.scope.id === id));

describe("effective permission resolution examples", () => {
  it("staff user (operations): prepares globally, never approves or executes money", () => {
    const f = blank({ roles: ["operations"] });
    expect(has(f, "clients", "prepare", "global")).toBe(true);
    expect(has(f, "onboarding", "review", "global")).toBe(true);
    expect(has(f, "capital", "execute")).toBe(false);
    expect(has(f, "clients", "approve")).toBe(false);
    expect(userTypes(f)).toContain("harmonious");
  });

  it("Fund Manager: only the exact managed fund, never global", () => {
    const f = blank({ roles: ["fund_manager"], managedFunds: [{ id: "A", name: "Fund A" }] });
    expect(has(f, "funds", "view", "fund", "A")).toBe(true);
    expect(has(f, "funds", "view", "fund", "B")).toBe(false);
    expect(effectivePermissions(f).every((p) => p.scope.type !== "global")).toBe(true);
    expect(has(f, "capital", "execute")).toBe(false);
  });

  it("client user: only their own client", () => {
    const f = blank({ clientMemberships: [{ id: "C1", name: "Acme", role: "member", canApprove: false }] });
    expect(has(f, "clients", "view", "client", "C1")).toBe(true);
    expect(has(f, "clients", "approve")).toBe(false);
    expect(effectivePermissions(f).every((p) => p.source === "relationship")).toBe(true);
  });

  it("investor: only their own profiles", () => {
    const f = blank({ roles: ["investor"], investmentProfiles: [{ id: "P1", label: "Individual", status: "active" }] });
    expect(has(f, "investors", "view", "investment_profile", "P1")).toBe(true);
    expect(has(f, "investors", "view", "global")).toBe(false);
    expect(has(f, "funds", "view", "global")).toBe(false);
  });
});

describe("institutional controls", () => {
  it("an email domain grants nothing; only exact role records count", () => {
    expect(effectivePermissions(blank({ userId: "someone@harmonious.co" }))).toEqual([]);
  });

  it("revoked grants never count", () => {
    const f = blank({ roles: ["operations"], staffGrants: [{ capability: "manage_permissions", role_key: null, revoked_at: "2026-01-01" }] });
    expect(has(f, "administration", "manage_access")).toBe(false);
  });

  it("live direct grants are labelled as direct grants", () => {
    const f = blank({ roles: ["operations"], staffGrants: [{ capability: "manage_permissions", role_key: null, revoked_at: null }] });
    expect(effectivePermissions(f).find((p) => p.action === "manage_access")?.source).toBe("direct_grant");
  });

  it("staff grants never apply to non-staff", () => {
    const f = blank({ staffGrants: [{ capability: "manage_permissions", role_key: null, revoked_at: null }] });
    expect(effectivePermissions(f)).toEqual([]);
  });

  it("expired, revoked, unaccepted or suspended delegations fail immediately", () => {
    const d = { id: "d", direction: "acting_for" as const, counterpart: "X", scope_type: "investment_profile", scope_id: "P", authority_level: "view", status: "active", acceptance_state: "accepted", expires_at: null, revoked_at: null, capabilities: ["view_documents"] };
    expect(activeDelegation(d)).toBe(true);
    expect(activeDelegation({ ...d, expires_at: "2000-01-01" })).toBe(false);
    expect(activeDelegation({ ...d, revoked_at: "2026-01-01" })).toBe(false);
    expect(activeDelegation({ ...d, acceptance_state: "pending" })).toBe(false);
    expect(activeDelegation({ ...d, status: "suspended" })).toBe(false);
    expect(has(blank({ delegations: [d] }), "documents", "view", "investment_profile", "P")).toBe(true);
    expect(effectivePermissions(blank({ delegations: [{ ...d, expires_at: "2000-01-01" }] }))).toEqual([]);
    expect(effectivePermissions(blank({ delegations: [{ ...d, direction: "granted_to" }] }))).toEqual([]);
  });

  it("explicit deny overrides grants", () => {
    const perms = effectivePermissions(blank({ roles: ["admin"] }));
    const denied = applyDenies(perms, [{ area: "tax", action: "approve", scope: { type: "global", id: null, label: "" } }]);
    expect(denied.some((p) => p.area === "tax" && p.action === "approve")).toBe(false);
    expect(denied.some((p) => p.area === "tax" && p.action === "view")).toBe(true);
  });

  it("super admin gets every Operations capability but never full TIN without the Tax role", () => {
    const f = blank({ roles: ["super_admin"] });
    const m = matrix(effectivePermissions(f));
    expect(m.capital.execute).toBe("role");
    expect(m.administration.manage_access).not.toBeNull();
    expect(sensitiveAccess(f)).not.toContain("Full tax IDs (Tax role)");
  });
});

describe("Stage 1 is read-only", () => {
  it("the server module only reads and every call is gated server-side", () => {
    const src = readFileSync("src/lib/access-control.functions.ts", "utf8");
    expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect((src.match(/await requireAccessViewer\(context\)/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(src).not.toMatch(/@harmonious|endsWith\(/);
  });

  it("no enforcement path imports the read model", () => {
    for (const f of ["src/lib/ops-capabilities.ts", "src/lib/staff-rbac.server.ts", "src/lib/contract-coverage.ts"]) {
      expect(readFileSync(f, "utf8")).not.toContain("access-control-model");
    }
  });
});
