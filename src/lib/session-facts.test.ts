/**
 * Consolidation Stage 1 — parity and adversarial proofs for the single
 * canonical session resolver (gatherFacts -> resolution -> projections).
 *
 * Parity: each legacy probe's pre-refactor logic is reproduced verbatim below
 * as a reference and compared with the canonical projection for every
 * legitimate scenario. Intentional differences are asserted explicitly.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  adminAccessProjection,
  attentionWorkspaces,
  gatherFacts,
  gatherStaffFacts,
  operationsAccessProjection,
  professionalStandingProjection,
} from "@/lib/session-facts.server";
import {
  availableWorkspaces,
  canEnterWorkspace,
  defaultWorkspace,
  hasOperationsAccess,
  operationsAccessFromEmail,
} from "@/lib/session-resolution";

type Row = any;
let tables: any = {};
let queryCount = 0;

function builder(table: string) {
  queryCount += 1;
  const filters: ((r: Row) => boolean)[] = [];
  let single = false;
  const run = () => (tables[table] ?? []).filter((r: any) => filters.every((f) => f(r)));
  const api: any = {
    select: () => api,
    order: () => api,
    limit: () => api,
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), api),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), api),
    in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), api),
    maybeSingle: () => ((single = true), api),
    then: (resolve: any) => {
      const data = run();
      return resolve({ data: single ? (data[0] ?? null) : data, error: null });
    },
  };
  return api;
}

const ME = "user-me";
const ctx = (userId = ME, email = "") => ({
  userId,
  claims: { email },
  supabase: { from: (t: string) => builder(t) },
});

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

const role = (r: string, user = ME) => ({ user_id: user, role: r });
const delegation = (id: string, principal: string, extra: Row = {}) => ({
  id,
  principal_user_id: principal,
  delegate_user_id: ME,
  organization_id: "org-1",
  status: "active",
  acceptance_state: "accepted",
  scope_type: "person",
  scope_id: principal,
  authority_level: "view",
  expires_at: future,
  revoked_at: null,
  ...extra,
});

/* ---------------- Legacy reference implementations (pre-refactor) ---------------- */

async function legacyAllowedWorkspaces(t: any, userId = ME) {
  const any = (rows: Row[]) => rows.length > 0;
  const by = (name: string, col: string) => (t[name] ?? []).filter((r) => r[col] === userId);
  const list: string[] = [];
  if (any(by("investment_profiles", "owner_user_id")) || any(by("investor_positions", "investor_user_id")))
    list.push("investor");
  if (any(by("fund_managers", "user_id"))) list.push("fund_manager");
  if (any(by("client_users", "user_id")) || by("cap_holder_access", "user_id").some((c) => !c.revoked_at))
    list.push("company");
  if (by("delegations", "delegate_user_id").some((d) => d.status === "active")) list.push("professional");
  if (any(by("user_roles", "user_id"))) list.push("operations");
  return list;
}
function legacyAdminAccess(t: any, userId = ME) {
  const roles = (t.user_roles ?? []).filter((r) => r.user_id === userId).map((r) => r.role);
  const isAdmin = roles.includes("admin");
  const isFundManager = roles.includes("fund_manager");
  const offeringIds =
    isFundManager && !isAdmin
      ? (t.fund_managers ?? []).filter((r) => r.user_id === userId).map((r) => r.offering_id)
      : [];
  return { isAdmin, isFundManager, isReviewer: isAdmin || isFundManager, offeringIds };
}
function legacyOperationsAccess(t: any, userId = ME) {
  const roles = (t.user_roles ?? []).filter((r) => r.user_id === userId).map((r) => r.role);
  const isAdmin = roles.includes("admin");
  const isOperations = roles.includes("operations");
  return { isAdmin, isOperations, allowed: isAdmin || isOperations };
}
function legacyProfessionalStanding(t: any, userId = ME) {
  const seats = (t.professional_memberships ?? []).filter((m) => m.user_id === userId);
  const active = (t.delegations ?? []).filter((d) => d.delegate_user_id === userId && d.status === "active").length;
  return { isProfessional: seats.some((m) => m.status === "active") || active > 0, activeDelegations: active };
}
function legacySessionKinds(t: any, userId = ME) {
  // Old gatherFacts: delegation usable if status active + accepted/not_required (no expiry check).
  const ds = (t.delegations ?? []).filter(
    (d) =>
      d.delegate_user_id === userId &&
      d.status === "active" &&
      (d.acceptance_state === "accepted" || d.acceptance_state === "not_required"),
  );
  return ds.length;
}

/* ---------------- Scenarios ---------------- */

const SCENARIOS: Record<string, () => any> = {
  "investor only": () => ({ investment_profiles: [{ id: "p1", owner_user_id: ME }] }),
  "multiple investment profiles": () => ({
    investment_profiles: [
      { id: "p1", owner_user_id: ME },
      { id: "p2", owner_user_id: ME },
      { id: "p3", owner_user_id: ME },
    ],
  }),
  "fund manager": () => ({ fund_managers: [{ user_id: ME, offering_id: "f1" }], user_roles: [role("fund_manager")] }),
  "company user": () => ({ client_users: [{ user_id: ME, client_id: "c1" }] }),
  "professional delegate": () => ({
    delegations: [delegation("d1", "client-a")],
    professional_memberships: [{ id: "m1", user_id: ME, organization_id: "org-1", seat_role: "member", status: "active" }],
  }),
  "multiple delegations": () => ({ delegations: [delegation("d1", "client-a"), delegation("d2", "client-b")] }),
  staff: () => ({ user_roles: [role("operations")] }),
  "deactivated staff": () => ({ user_roles: [] }),
  "investor + staff": () => ({
    investor_positions: [{ id: "pos1", investor_user_id: ME }],
    user_roles: [role("compliance")],
  }),
  "manager + investor": () => ({
    fund_managers: [{ user_id: ME, offering_id: "f1" }],
    investment_profiles: [{ id: "p1", owner_user_id: ME }],
  }),
  "company + investor": () => ({
    cap_holder_access: [{ user_id: ME, client_id: "c9", revoked_at: null }],
    investment_profiles: [{ id: "p1", owner_user_id: ME }],
  }),
  "professional + investor": () => ({
    delegations: [delegation("d1", "client-a")],
    investment_profiles: [{ id: "p1", owner_user_id: ME }],
  }),
  "staff + fund manager": () => ({
    user_roles: [role("admin"), role("fund_manager")],
    fund_managers: [{ user_id: ME, offering_id: "f1" }],
  }),
  "pending invitation": () => ({
    profiles: [{ user_id: ME, email: "me@example.com", legal_name: "Me" }],
    fund_invitations: [{ id: "i1", email: "me@example.com", accepted_at: null, status: "pending" }],
  }),
  "revoked delegation": () => ({ delegations: [delegation("d1", "client-a", { status: "revoked", revoked_at: past })] }),
  "removed company access": () => ({ cap_holder_access: [{ user_id: ME, client_id: "c1", revoked_at: past }] }),
  "removed manager relationship": () => ({ user_roles: [role("fund_manager")] }),
};

const EXPECTED_WORKSPACES: Record<string, string[]> = {
  "investor only": ["investor"],
  "multiple investment profiles": ["investor"],
  "fund manager": ["fund-manager"],
  "company user": ["company"],
  "professional delegate": ["professional"],
  "multiple delegations": ["professional"],
  staff: ["operations"],
  "deactivated staff": [],
  "investor + staff": ["investor", "operations"],
  "manager + investor": ["investor", "fund-manager"],
  "company + investor": ["investor", "company"],
  "professional + investor": ["investor", "professional"],
  "staff + fund manager": ["fund-manager", "operations"],
  "pending invitation": [],
  "revoked delegation": [],
  "removed company access": [],
  "removed manager relationship": [],
};

beforeEach(() => {
  tables = {};
  queryCount = 0;
});

describe("parity: canonical resolver vs legacy probes", () => {
  for (const [name, make] of Object.entries(SCENARIOS)) {
    it(`${name}: workspaces, admin, operations and professional projections`, async () => {
      tables = make();
      const facts = await gatherFacts(ctx());

      expect(availableWorkspaces(facts).map((w) => w.id)).toEqual(EXPECTED_WORKSPACES[name]);
      expect(adminAccessProjection(facts)).toEqual(legacyAdminAccess(tables));
      expect(operationsAccessProjection(await gatherStaffFacts(ctx()))).toEqual(legacyOperationsAccess(tables));
      const pro = professionalStandingProjection(facts);
      expect({ isProfessional: pro.isProfessional, activeDelegations: pro.activeDelegations }).toEqual(
        legacyProfessionalStanding(tables),
      );
      expect(facts.activeDelegationIds.length).toBe(legacySessionKinds(tables));

      // Action Center parity, except the documented old-path bug: any role
      // row (e.g. "fund_manager") used to count as Operations.
      const legacy = (await legacyAllowedWorkspaces(tables)).filter(
        (k) => k !== "operations" || facts.operations.operationsEntry,
      );
      expect(attentionWorkspaces(facts)).toEqual(legacy);
    });
  }

  it("pending invitation is counted, not granted", async () => {
    tables = SCENARIOS["pending invitation"]!();
    const facts = await gatherFacts(ctx());
    expect(facts.pendingInvitationCount).toBe(1);
    expect(availableWorkspaces(facts)).toEqual([]);
  });

  it("multi-role users keep every workspace; default only picks a destination", async () => {
    tables = {
      ...SCENARIOS["manager + investor"]!(),
      client_users: [{ user_id: ME, client_id: "c1" }],
      delegations: [delegation("d1", "client-a")],
      user_roles: [role("finance")],
    };
    const facts = await gatherFacts(ctx());
    const ids = availableWorkspaces(facts).map((w) => w.id);
    expect(ids).toEqual(["investor", "fund-manager", "company", "professional", "operations"]);
    expect(defaultWorkspace(facts)?.id).toBe("investor");
    for (const id of ids) expect(canEnterWorkspace(facts, id)).toBe(true);
  });

  it("granular Operations capabilities are retained, not collapsed", async () => {
    tables = { user_roles: [role("compliance")] };
    const facts = await gatherFacts(ctx());
    expect(facts.operations.operationsEntry).toBe(true);
    expect(facts.operations.capabilities.length).toBeGreaterThan(0);
    expect(facts.operations.capabilities).not.toContain("capital:execute");
    // Legacy coarse view says "not allowed" for compliance — unchanged, documented.
    expect(operationsAccessProjection(facts.operations).allowed).toBe(false);
  });

  it("delegation facts keep principal, organization, scope, acceptance and expiry", async () => {
    tables = { delegations: [delegation("d1", "client-a"), delegation("d2", "client-b", { acceptance_state: "pending" })] };
    const facts = await gatherFacts(ctx());
    const a = facts.delegations.find((d) => d.id === "d1")!;
    expect(a).toMatchObject({ principalUserId: "client-a", organizationId: "org-1", scopeType: "person", scopeId: "client-a", usable: true });
    const b = facts.delegations.find((d) => d.id === "d2")!;
    expect(b).toMatchObject({ principalUserId: "client-b", current: true, usable: false });
    expect(facts.activeDelegationIds).toEqual(["d1"]);
  });
});

describe("adversarial", () => {
  it("an @harmonious.co email grants nothing", async () => {
    expect(operationsAccessFromEmail("ceo@harmonious.co")).toBe(false);
    tables = { profiles: [{ user_id: ME, email: "ceo@harmonious.co", legal_name: "X" }] };
    const facts = await gatherFacts(ctx(ME, "ceo@harmonious.co"));
    expect(hasOperationsAccess(facts)).toBe(false);
    expect(facts.operations.capabilities).toEqual([]);
    expect(availableWorkspaces(facts)).toEqual([]);
    expect(adminAccessProjection(facts).isAdmin).toBe(false);
    expect(attentionWorkspaces(facts)).toEqual([]);
  });

  it("invented and stale workspace identifiers are refused", async () => {
    tables = SCENARIOS["investor only"]!();
    const facts = await gatherFacts(ctx());
    for (const id of ["operations", "fund-manager", "company", "professional", "admin", "../ops", "investor:other"])
      expect(canEnterWorkspace(facts, id)).toBe(false);
  });

  it("other people's profiles, funds, companies and delegations never become mine", async () => {
    tables = {
      investment_profiles: [{ id: "p-other", owner_user_id: "someone" }],
      fund_managers: [{ user_id: "other-mgr", offering_id: "f-other" }],
      client_users: [{ user_id: "someone", client_id: "c-other" }],
      cap_holder_access: [{ user_id: "someone", client_id: "c-other", revoked_at: null }],
      delegations: [{ ...delegation("d-other", "client-b"), delegate_user_id: "other-pro" }],
    };
    const facts = await gatherFacts(ctx());
    expect(facts.investmentProfileIds).toEqual([]);
    expect(facts.managedFundIds).toEqual([]);
    expect(facts.clientIds).toEqual([]);
    expect(facts.companyIds).toEqual([]);
    expect(facts.delegations).toEqual([]);
    expect(availableWorkspaces(facts)).toEqual([]);
  });

  it("a Client A delegation never yields Client B authority", async () => {
    tables = { delegations: [delegation("d1", "client-a")] };
    const facts = await gatherFacts(ctx());
    expect(facts.delegations.map((d) => d.principalUserId)).toEqual(["client-a"]);
    expect(facts.delegations.some((d) => d.principalUserId === "client-b")).toBe(false);
  });

  it("expired delegation is not usable and does not open the professional workspace", async () => {
    tables = { delegations: [delegation("d1", "client-a", { expires_at: past })] };
    const facts = await gatherFacts(ctx());
    expect(facts.activeDelegationIds).toEqual([]);
    expect(canEnterWorkspace(facts, "professional")).toBe(false);
    expect(attentionWorkspaces(facts)).not.toContain("professional");
  });

  it("revocations take effect on the very next request (no caching)", async () => {
    tables = {
      user_roles: [role("operations")],
      fund_managers: [{ user_id: ME, offering_id: "f1" }],
      client_users: [{ user_id: ME, client_id: "c1" }],
      delegations: [delegation("d1", "client-a")],
    };
    let facts = await gatherFacts(ctx());
    expect(availableWorkspaces(facts).map((w) => w.id)).toEqual(["fund-manager", "company", "professional", "operations"]);

    tables.user_roles = []; // staff deactivated / capability removed
    tables.fund_managers = []; // manager relationship removed
    tables.client_users = []; // company access removed
    tables.delegations = [delegation("d1", "client-a", { status: "revoked", revoked_at: new Date().toISOString() })];
    facts = await gatherFacts(ctx());
    expect(availableWorkspaces(facts)).toEqual([]);
    expect((await gatherStaffFacts(ctx())).operationsEntry).toBe(false);
    // A workspace id remembered by the browser cannot be re-entered.
    for (const id of ["fund-manager", "company", "professional", "operations"]) expect(canEnterWorkspace(facts, id)).toBe(false);
  });

  it("removing one capability-bearing role removes its capabilities next request", async () => {
    tables = { user_roles: [role("finance"), role("compliance")] };
    const before = await gatherStaffFacts(ctx());
    tables = { user_roles: [role("compliance")] };
    const after = await gatherStaffFacts(ctx());
    const lost = before.capabilities.filter((c) => !after.capabilities.includes(c));
    expect(lost.length).toBeGreaterThan(0);
  });

  it("facts depend only on the authenticated user, never a hostname or requested workspace", async () => {
    tables = { user_roles: [role("admin")], investment_profiles: [{ id: "p1", owner_user_id: ME }] };
    const a = await gatherFacts(ctx());
    const b = await gatherFacts({ ...ctx(), requestedWorkspace: "operations", host: "app.harmonious.co" } as any);
    expect(b).toEqual(a);
    expect(hasOperationsAccess(b)).toBe(true); // app host does not strip staff authority

    tables = {};
    const c = await gatherFacts({ ...ctx(), host: "ops.harmonious.co", requestedWorkspace: "operations" } as any);
    expect(hasOperationsAccess(c)).toBe(false); // ops host grants nothing
  });

  it("query budget: full fact set is a fixed number of reads (no N+1)", async () => {
    tables = SCENARIOS["multiple delegations"]!();
    tables.profiles = [{ user_id: ME, email: "me@example.com", legal_name: "Me" }];
    queryCount = 0;
    await gatherFacts(ctx());
    expect(queryCount).toBe(12);
    tables.delegations = Array.from({ length: 20 }, (_, i) => delegation(`d${i}`, `client-${i}`));
    queryCount = 0;
    await gatherFacts(ctx());
    expect(queryCount).toBe(12);
  });
});
