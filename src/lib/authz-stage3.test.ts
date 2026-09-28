import { describe, expect, it } from "vitest";
import { shadowCompare } from "@/lib/authz-shadow";
import { STAGE3A_CANDIDATES, emptyCounts, isExcluded, migrationStatus } from "@/lib/authz-stage3";
import { readFileSync } from "node:fs";

const staff = { userId: "11111111-1111-1111-1111-111111111111", platformRoles: ["admin"], clientMemberships: [], fundMemberships: [], assignments: [], grants: [] } as any;
const nobody = { ...staff, platformRoles: [] };
const res = { type: "platform", id: null } as any;

describe("Stage 3A shadow pilot", () => {
  it("legacy stays in charge and RBAC can't override a legacy deny", () => {
    const r = shadowCompare({ endpoint: "x", legacyAllowed: false, facts: staff, permission: "administration.access.view", resource: res });
    expect(r.allowed).toBe(false);
  });
  it("records allow/allow and deny/deny", () => {
    const a = shadowCompare({ endpoint: "x", legacyAllowed: true, facts: staff, permission: "clients.view", resource: { type: "platform" } as any });
    const d = shadowCompare({ endpoint: "x", legacyAllowed: false, facts: nobody, permission: "clients.view", resource: { type: "platform" } as any });
    expect([a.record.category, d.record.category]).toEqual([a.record.canonical_allowed ? "allow_allow" : "legacy_allow_rbac_deny", "deny_deny"]);
  });
  it("surfaces both mismatch directions", () => {
    expect(shadowCompare({ endpoint: "x", legacyAllowed: true, facts: nobody, permission: "clients.view", resource: res }).record.category).toBe("legacy_allow_rbac_deny");
    const up = shadowCompare({ endpoint: "x", legacyAllowed: false, facts: staff, permission: "clients.view", resource: res });
    expect(up.allowed).toBe(false);
    if (up.record.canonical_allowed) expect(up.record.category).toBe("legacy_deny_rbac_allow");
  });
  it("logs no payloads or names", () => {
    const r = shadowCompare({ endpoint: "x", legacyAllowed: true, facts: nobody, permission: "clients.view", resource: { type: "client", id: "not-a-uuid", label: "Secret Client LLC" } as any }).record;
    expect(JSON.stringify(r)).not.toMatch(/Secret Client|not-a-uuid/);
    expect(Object.keys(r).sort()).toEqual(["actor_user_id", "canonical_allowed", "canonical_reason", "category", "endpoint", "legacy_allowed", "permission", "resource_id", "resource_type"]);
  });
  it("any mismatch blocks Ready for Cutover; Migrated is never reached", () => {
    const p = { area: "a", file: "f", endpoint: "e", legacy: "l", canonical: "c" };
    const c = { ...emptyCounts(), allow_allow: 100, deny_deny: 100 };
    expect(migrationStatus(p, c)).toBe("Ready for Cutover");
    expect(migrationStatus(p, { ...c, legacy_deny_rbac_allow: 1 })).toBe("Blocked");
    expect(migrationStatus(p, { ...c, legacy_allow_rbac_deny: 1 })).toBe("Blocked");
  });
  it("protected areas are excluded and reclassified candidates aren't shadowed", () => {
    expect(isExcluded(["tax"])).toBe(true);
    expect(isExcluded(["navigation"])).toBe(false);
    for (const p of STAGE3A_CANDIDATES) expect(migrationStatus(p, { ...emptyCounts(), allow_allow: 999, deny_deny: 999 })).toBe("Not Started");
  });
  it("no cutover or role/permission writes in the pilot code", () => {
    const src = readFileSync("src/lib/authz-stage3.ts", "utf8") + readFileSync("src/lib/access-admin.functions.ts", "utf8").split("getStage3Migration")[1];
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(|user_roles|cutover\s*\(/);
  });
});
