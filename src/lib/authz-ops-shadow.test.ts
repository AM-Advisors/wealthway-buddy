import { describe, expect, it } from "vitest";
import { canonicalOperationsEntry, canonicalOperationsTeam, legacyOperations, type OpsFacts } from "@/lib/authz-ops-shadow";
import { shadowRecordFor } from "@/lib/authz-shadow";
import { STAGE3A1_PATHS, emptyCounts, migrationStatus } from "@/lib/authz-stage3";
import { readFileSync } from "node:fs";

const U = "11111111-1111-1111-1111-111111111111";
const f = (roles: string[], extra: Partial<OpsFacts> = {}): OpsFacts => ({ authenticated: true, suspended: false, platformRoles: roles, assignments: [], ...extra });
const cat = (roles: string[], extra: Partial<OpsFacts> = {}) =>
  shadowRecordFor({ endpoint: "e", actorUserId: U, legacyAllowed: legacyOperations(roles) && !extra.suspended, canonical: canonicalOperationsEntry(f(roles, extra)) }).category;

describe("Stage 3A.1 Operations shadow - identities", () => {
  const cases: [string, string[], string][] = [
    ["Super Administrator (with admin)", ["super_admin", "admin"], "allow_allow"],
    ["Operations Administrator", ["admin"], "allow_allow"],
    ["Operations staff", ["operations"], "allow_allow"],
    ["Legal", ["legal"], "legacy_deny_rbac_allow"],
    ["Compliance", ["compliance"], "legacy_deny_rbac_allow"],
    ["Fund Administration", ["fund_administration"], "legacy_deny_rbac_allow"],
    ["Tax", ["tax"], "legacy_deny_rbac_allow"],
    ["Finance", ["finance"], "legacy_deny_rbac_allow"],
    ["Client Success", ["client_success"], "legacy_deny_rbac_allow"],
    ["Executive", ["executive"], "legacy_deny_rbac_allow"],
    ["Super Administrator alone", ["super_admin"], "legacy_deny_rbac_allow"],
    ["Fund Manager only", ["fund_manager"], "deny_deny"],
    ["Client user only (info@ shape)", ["client_gp"], "deny_deny"],
    ["Investor only", ["investor"], "deny_deny"],
    ["Professional only", [], "deny_deny"],
    ["No staff role", [], "deny_deny"],
  ];
  for (const [n, r, want] of cases) it(n, () => expect(cat(r)).toBe(want));
  it("suspended staff is denied canonically", () => expect(canonicalOperationsEntry(f(["admin"], { suspended: true })).reason).toBe("suspended"));
  it("legacy allow / RBAC deny surfaces (suspended admin still passes legacy)", () => {
    expect(shadowRecordFor({ endpoint: "e", actorUserId: U, legacyAllowed: true, canonical: canonicalOperationsEntry(f(["admin"], { suspended: true })) }).category).toBe("legacy_allow_rbac_deny");
  });
  it("live global Harmonious assignment counts; expired or scoped doesn't", () => {
    const a = (x: any) => ({ id: "a", role_key: "operations", role_version: 1, scope_type: "global", scope_id: null, effective_at: "2020-01-01", expires_at: null, revoked_at: null, ...x });
    expect(canonicalOperationsEntry(f([], { assignments: [a({})] })).allowed).toBe(true);
    expect(canonicalOperationsEntry(f([], { assignments: [a({ expires_at: "2021-01-01" })] })).allowed).toBe(false);
    expect(canonicalOperationsEntry(f([], { assignments: [a({ scope_type: "client", scope_id: U })] })).allowed).toBe(false);
  });
  it("classification, email and memberships are not inputs", () => {
    const src = readFileSync("src/lib/authz-ops-shadow.ts", "utf8").split("*/").slice(1).join("*/");
    expect(src).not.toMatch(/email|classification|provider|client_users|professional/i);
  });
  it("roster uses its own (gap) key and never Ready for Cutover", () => {
    expect(canonicalOperationsTeam(f(["operations"])).key).toMatch(/gap/);
    const team = STAGE3A1_PATHS[1]!;
    expect(migrationStatus(team, { ...emptyCounts(), allow_allow: 999, deny_deny: 999 })).toBe("Shadowing");
  });
  it("starts Shadowing; any mismatch blocks", () => {
    const entry = STAGE3A1_PATHS[0]!;
    expect(migrationStatus(entry, emptyCounts())).toBe("Shadowing");
    expect(migrationStatus(entry, { ...emptyCounts(), allow_allow: 99, legacy_deny_rbac_allow: 1 })).toBe("Blocked");
  });
  it("record carries no names, emails or payloads", () => {
    const r = shadowRecordFor({ endpoint: "operations.functions.ts::listOperationsTeam", actorUserId: U, legacyAllowed: true, canonical: canonicalOperationsTeam(f(["operations"])) });
    expect(Object.keys(r).sort()).toEqual(["actor_user_id", "canonical_allowed", "canonical_reason", "category", "endpoint", "legacy_allowed", "permission", "resource_id", "resource_type"]);
    expect(JSON.stringify(r)).not.toMatch(/@/);
  });
  it("legacy result is returned unchanged and the roster exposes no auth secrets", () => {
    const src = readFileSync("src/lib/operations.functions.ts", "utf8");
    expect(src).toMatch(/await shadowOperations\("getOperationsAccess", context.userId, result.allowed\);\s*return result;/);
    const team = src.slice(src.indexOf("export const listOperationsTeam"), src.indexOf("export const inviteOperationsMember"));
    expect(team).not.toMatch(/password|token|provider|identities|app_metadata/i);
    expect(team).toMatch(/throw e;/);
  });
  it("only the two approved functions are shadowed", () => {
    const src = readFileSync("src/lib/operations.functions.ts", "utf8");
    expect(src.match(/shadowOperations\("/g)!.length).toBe(3);
  });
});
