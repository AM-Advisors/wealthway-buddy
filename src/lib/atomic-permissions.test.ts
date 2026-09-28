import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { authorize, PROTECTED_PERMISSIONS, type Assignment, type AuthzFacts, type Grant } from "@/lib/authorize";
import {
  ATOMIC_KEYS, clientDeleteDraftProblem, covers, DESTRUCTIVE_ATOMICS, FORBIDDEN_KEYS, FUND_TRANSITIONS,
  fundDeleteDraftProblem, fundTransitionProblem, lifecycleAuditEvent, type ClientDependencies, type FundDependencies,
} from "@/lib/atomic-permissions";
import { shadowCompare } from "@/lib/authz-shadow";

const F = (p: Partial<AuthzFacts> = {}): AuthzFacts => ({
  userId: "u", roles: [], staffGrants: [], customRoles: {}, managedFunds: [], investorFunds: [], investmentProfiles: [],
  clientMemberships: [], companies: [], professionalMemberships: [], delegations: [],
  authenticated: true, suspended: false, assignments: [], grants: [], roleDefinitions: [], ...p,
});
const G = (permission: string, scope_type: Grant["scope_type"] = "global", scope_id: string | null = null, effect: Grant["effect"] = "allow"): Grant =>
  ({ id: permission, permission, effect, scope_type, scope_id, effective_at: "2020-01-01T00:00:00Z", expires_at: null, revoked_at: null });
const A = (role_key: string, scope_type: Assignment["scope_type"], scope_id: string | null): Assignment =>
  ({ id: role_key, role_key, role_version: null, scope_type, scope_id, effective_at: "2020-01-01T00:00:00Z", expires_at: null, revoked_at: null });
const g = { type: "global" as const, id: null };
const fundA = { type: "fund" as const, id: "A", ancestors: [{ type: "client" as const, id: "C1" }] };
const fundB = { type: "fund" as const, id: "B", ancestors: [{ type: "client" as const, id: "C2" }] };
const ok = (f: AuthzFacts, p: string, r: any = g) => authorize(f, p, r).allowed;

describe("atomic implication rules", () => {
  it("create doesn't imply delete; edit doesn't imply archive; archive doesn't imply delete; restore is separate", () => {
    const creator = F({ grants: [G("funds.create"), G("clients.create")] });
    expect(ok(creator, "funds.delete_draft")).toBe(false);
    expect(ok(creator, "clients.delete_draft")).toBe(false);
    const editor = F({ grants: [G("funds.edit"), G("clients.edit")] });
    expect(ok(editor, "funds.edit_setup")).toBe(true);
    for (const k of DESTRUCTIVE_ATOMICS) expect(ok(editor, k)).toBe(false);
    const archiver = F({ grants: [G("funds.archive"), G("clients.archive")] });
    expect(ok(archiver, "funds.delete_draft")).toBe(false);
    expect(ok(archiver, "funds.restore")).toBe(false);
    expect(ok(archiver, "clients.restore")).toBe(false);
    expect(ok(F({ grants: [G("funds.close")] }), "funds.archive")).toBe(false);
    expect(ok(F({ grants: [G("funds.archive")] }), "funds.close")).toBe(false);
  });
  it("aggregates cover sub-resource atomics, and atomics are evaluable alone", () => {
    expect(covers("funds.manage_investors", "funds.investors.add")).toBe(true);
    expect(covers("clients.edit", "clients.contacts.remove")).toBe(true);
    expect(covers("funds.manage_team", "funds.team.manage_access")).toBe(false);
    const only = F({ grants: [G("funds.investors.add", "fund", "A")] });
    expect(ok(only, "funds.investors.add", fundA)).toBe(true);
    expect(ok(only, "funds.investors.remove", fundA)).toBe(false);
  });
  it("no unrestricted delete key exists", () => {
    for (const k of FORBIDDEN_KEYS) { expect(ATOMIC_KEYS).not.toContain(k); expect(ok(F({ roles: ["super_admin"] }), k)).toBe(false); }
  });
  it("explicit deny on a broad permission blocks its atomics", () => {
    expect(ok(F({ roles: ["super_admin"], grants: [G("funds.edit", "global", null, "deny")] }), "funds.investors.add", fundA)).toBe(false);
  });
});

describe("scope", () => {
  it("Fund Manager Admin of A can't manage B", () => {
    const f = F({ assignments: [A("fund_manager_admin", "fund", "A")] });
    expect(ok(f, "funds.investors.add", fundA)).toBe(true);
    expect(ok(f, "funds.team.manage_access", fundA)).toBe(true);
    expect(ok(f, "funds.investors.add", fundB)).toBe(false);
    expect(ok(f, "funds.archive", fundA)).toBe(false);
  });
  it("Client A permission doesn't affect Client B", () => {
    const f = F({ grants: [G("clients.manage_contacts", "client", "C1")] });
    expect(ok(f, "clients.contacts.add", { type: "client", id: "C1" })).toBe(true);
    expect(ok(f, "clients.contacts.add", { type: "client", id: "C2" })).toBe(false);
  });
  it("no scope grants nothing", () => {
    expect(ok(F({ grants: [G("funds.investors.add", "fund", null)] }), "funds.investors.add", fundA)).toBe(false);
    expect(ok(F({ assignments: [A("fund_manager_admin", "fund", null)] }), "funds.view", fundA)).toBe(false);
  });
  it("Client Principal / GP gains no contact or access management", () => {
    const f = F({ assignments: [A("client_principal", "client", "C1")] });
    for (const k of ["clients.contacts.add", "clients.manage_access", "clients.archive", "clients.delete_draft"]) expect(ok(f, k, { type: "client", id: "C1" })).toBe(false);
  });
});

describe("Super Administrator", () => {
  const sa = F({ roles: ["super_admin"] });
  it("receives every ordinary Client/Fund permission globally", () => {
    for (const k of ATOMIC_KEYS) expect(ok(sa, k, fundA)).toBe(true);
  });
  it("still can't reach protected systems", () => {
    for (const k of PROTECTED_PERMISSIONS) expect(ok(sa, k)).toBe(false);
  });
  it("Client Operations creates/edits but doesn't manage access or delete drafts", () => {
    const opsF = F({ roles: ["operations"] });
    expect(ok(opsF, "clients.manage_access")).toBe(false);
    expect(ok(opsF, "clients.delete_draft")).toBe(false);
  });
});

const clientDeps = (p: Partial<ClientDependencies>): ClientDependencies => ({ status: "draft", executedAgreements: 0, funds: 0, companiesWithTransactions: 0, investors: 0, invoicesOrPayments: 0, bankAccounts: 0, accountingEntries: 0, taxRecords: 0, filings: 0, executedDocuments: 0, requiredAuditEvents: 0, ...p });
const fundDeps = (p: Partial<FundDependencies>): FundDependencies => ({ stage: "draft", investorsOrInvestments: 0, executedSubscriptions: 0, bankAccounts: 0, fundingActivity: 0, capitalCalls: 0, distributions: 0, accountingEntries: 0, navRecords: 0, taxRecords: 0, regulatoryFilings: 0, executedLegalDocuments: 0, ...p });

describe("destructive-action policy", () => {
  it("active client with history can't be hard deleted; unused draft can", () => {
    expect(clientDeleteDraftProblem(clientDeps({ status: "active" }))).toMatch(/archive/);
    expect(clientDeleteDraftProblem(clientDeps({ executedAgreements: 1 }))).toMatch(/executed agreements/);
    expect(clientDeleteDraftProblem(clientDeps({}))).toBeNull();
  });
  it("fund with investor/accounting/legal history can't be hard deleted; unused draft can", () => {
    expect(fundDeleteDraftProblem(fundDeps({ stage: "active" }))).toBeTruthy();
    expect(fundDeleteDraftProblem(fundDeps({ investorsOrInvestments: 1 }))).toMatch(/investors/);
    expect(fundDeleteDraftProblem(fundDeps({ accountingEntries: 2 }))).toMatch(/accounting/);
    expect(fundDeleteDraftProblem(fundDeps({ executedLegalDocuments: 1 }))).toMatch(/legal/);
    expect(fundDeleteDraftProblem(fundDeps({}))).toBeNull();
  });
  it("closing and archiving are distinct; restore doesn't reopen", () => {
    expect(FUND_TRANSITIONS["close"]!.permission).not.toBe(FUND_TRANSITIONS["archive"]!.permission);
    expect(fundTransitionProblem("close", "active")).toBeNull();
    expect(fundTransitionProblem("archive", "active")).toBeTruthy();
    expect(FUND_TRANSITIONS["restore"]!.to).not.toBe("active");
    expect(fundTransitionProblem("reopen", "archived")).toBeTruthy();
  });
  it("lifecycle audit events need reason and correlation ID", () => {
    const base = { actor_user_id: "a", resource_type: "fund" as const, resource_id: "f", action: "fund.closed" as const, before_state: { stage: "active" }, after_state: { stage: "closed" }, correlation_id: "c" };
    expect(lifecycleAuditEvent({ ...base, reason: "Final close" }).at).toBeTruthy();
    expect(() => lifecycleAuditEvent({ ...base, reason: " " })).toThrow();
  });
});

describe("shadow + UI", () => {
  it("shadow compares atomic permissions and legacy stays authoritative", () => {
    const r = shadowCompare({ endpoint: "fund.addInvestor", legacyAllowed: true, facts: F(), permission: "funds.investors.add", resource: fundA });
    expect(r.allowed).toBe(true);
    expect(r.record.permission).toBe("funds.investors.add");
    expect(r.record.category).toBe("legacy_allow_rbac_deny");
  });
  it("Access Control exposes atomic source and scope", () => {
    const fn = readFileSync("src/lib/access-control.functions.ts", "utf8");
    expect(fn).toContain("atomic: ATOMIC_PERMISSIONS.map");
    const ui = readFileSync("src/components/access-admin-panels.tsx", "utf8");
    expect(ui).toContain("Source: ${r.sources.join");
    expect(ui).toContain("scope: ${x.scope}");
  });
});
