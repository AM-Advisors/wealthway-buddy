import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adversarial tests for delegated professional access.
 *
 * Deny-by-default: membership grants nothing, only a live delegation carrying
 * the exact capability, at sufficient authority, over the resolved resource.
 */

const PRINCIPAL_A = "11111111-1111-4111-8111-000000000001";
const PRINCIPAL_B = "11111111-1111-4111-8111-000000000002";
const LAWYER = "22222222-2222-4222-8222-000000000001";
const OTHER_PRO = "22222222-2222-4222-8222-000000000002";
const ORG_1 = "33333333-3333-4333-8333-000000000001";
const ORG_2 = "33333333-3333-4333-8333-000000000002";
const PROFILE_A = "44444444-4444-4444-8444-000000000001";
const PROFILE_B = "44444444-4444-4444-8444-000000000002";
const FUND_A = "55555555-5555-4555-8555-000000000001";
const FUND_B = "55555555-5555-4555-8555-000000000002";
const INVESTMENT_A = "66666666-6666-4666-8666-000000000001";
const INVESTMENT_B = "66666666-6666-4666-8666-000000000002";

const HOUR = 3600_000;
const past = new Date(Date.now() - 48 * HOUR).toISOString();
const future = new Date(Date.now() + 48 * HOUR).toISOString();

type Delegation = Record<string, any>;

const delegations: Delegation[] = [];
const permissions: { delegation_id: string; capability: string }[] = [];
const memberships: Record<string, any>[] = [];

function delegation(over: Partial<Delegation>, caps: string[]): string {
  const id = `del-${delegations.length + 1}`;
  delegations.push({
    id,
    principal_user_id: PRINCIPAL_A,
    delegate_user_id: LAWYER,
    organization_id: null,
    scope_type: "person",
    scope_id: PRINCIPAL_A,
    authority_level: "view",
    status: "active",
    effective_at: past,
    expires_at: null,
    revoked_at: null,
    ...over,
  });
  for (const capability of caps) permissions.push({ delegation_id: id, capability });
  return id;
}

const tables: Record<string, any[]> = {
  profiles: [
    { id: PROFILE_A, user_id: PRINCIPAL_A },
    { id: PROFILE_B, user_id: PRINCIPAL_B },
  ],
  offerings: [{ id: FUND_A }, { id: FUND_B }],
  investor_applications: [
    { id: INVESTMENT_A, user_id: PRINCIPAL_A, offering_id: FUND_A },
    { id: INVESTMENT_B, user_id: PRINCIPAL_B, offering_id: FUND_B },
  ],
  delegations,
  delegation_permissions: permissions,
  professional_memberships: memberships,
  delegation_audit_events: [],
};

const writes: { table: string; op: string; payload: unknown }[] = [];

function builder(table: string) {
  let rows = [...(tables[table] ?? [])];
  const api: any = {
    select: () => api,
    order: () => api,
    limit: () => api,
    eq: (col: string, val: unknown) => {
      rows = rows.filter((r) => r[col] === val);
      return api;
    },
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve: any) => resolve({ data: rows, error: null }),
    insert: (payload: unknown) => {
      writes.push({ table, op: "insert", payload });
      return Promise.resolve({ data: null, error: null });
    },
    update: (payload: unknown) => {
      writes.push({ table, op: "update", payload });
      return api;
    },
  };
  return api;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => builder(table) },
}));

import { canAct } from "./delegated-access.server";
import {
  capabilityAllowedAtAuthority,
  isDelegationCapability,
} from "./delegation-model";

beforeEach(() => {
  writes.length = 0;
});

describe("delegated access", () => {
  it("grants nothing for organization membership alone", async () => {
    memberships.push({
      id: "m1",
      organization_id: ORG_1,
      user_id: LAWYER,
      status: "active",
    });
    const res = await canAct(LAWYER, "view_profile", { type: "person", id: PRINCIPAL_A });
    expect(res.allowed).toBe(false);
  });

  it("allows a granted capability over the intended principal", async () => {
    delegation({}, ["view_profile"]);
    const res = await canAct(LAWYER, "view_profile", { type: "person", id: PRINCIPAL_A });
    expect(res.allowed).toBe(true);
  });

  it("does not reach another principal", async () => {
    const res = await canAct(LAWYER, "view_profile", { type: "person", id: PRINCIPAL_B });
    expect(res.allowed).toBe(false);
  });

  it("cannot be used by a different professional", async () => {
    const res = await canAct(OTHER_PRO, "view_profile", { type: "person", id: PRINCIPAL_A });
    expect(res.allowed).toBe(false);
  });

  it("refuses anonymous callers", async () => {
    const res = await canAct(null, "view_profile", { type: "person", id: PRINCIPAL_A });
    expect(res.allowed).toBe(false);
  });

  it("refuses an unknown permission", async () => {
    const res = await canAct(LAWYER, "delete_everything", { type: "person", id: PRINCIPAL_A });
    expect(res.reason).toMatch(/unknown permission/i);
    expect(isDelegationCapability("delete_everything")).toBe(false);
  });

  it("refuses a capability that was never granted on the delegation", async () => {
    const res = await canAct(LAWYER, "view_documents", { type: "person", id: PRINCIPAL_A });
    expect(res.allowed).toBe(false);
  });

  it("will not let a view permission perform a mutation", async () => {
    const res = await canAct(
      LAWYER,
      "view_profile",
      { type: "person", id: PRINCIPAL_A },
      { mutation: true },
    );
    expect(res.reason).toMatch(/read-only/i);
  });

  it("fails an expired delegation", async () => {
    delegation(
      { delegate_user_id: OTHER_PRO, expires_at: new Date(Date.now() - HOUR).toISOString() },
      ["view_profile"],
    );
    const res = await canAct(OTHER_PRO, "view_profile", { type: "person", id: PRINCIPAL_A });
    expect(res.allowed).toBe(false);
  });

  it("fails a revoked delegation", async () => {
    delegation(
      { delegate_user_id: OTHER_PRO, status: "revoked", revoked_at: new Date().toISOString() },
      ["view_profile"],
    );
    const res = await canAct(OTHER_PRO, "view_profile", { type: "person", id: PRINCIPAL_A });
    expect(res.allowed).toBe(false);
  });

  it("fails a future-dated delegation until it is effective", async () => {
    delegation({ delegate_user_id: OTHER_PRO, effective_at: future }, ["view_profile"]);
    const res = await canAct(OTHER_PRO, "view_profile", { type: "person", id: PRINCIPAL_A });
    expect(res.allowed).toBe(false);
  });

  it("fails when the professional has no live seat at the delegating firm", async () => {
    memberships.push({ id: "m2", organization_id: ORG_2, user_id: OTHER_PRO, status: "suspended" });
    delegation({ delegate_user_id: OTHER_PRO, organization_id: ORG_2 }, ["view_profile"]);
    const res = await canAct(OTHER_PRO, "view_profile", { type: "person", id: PRINCIPAL_A });
    expect(res.allowed).toBe(false);
  });

  it("fails when acting through the wrong organization", async () => {
    const res = await canAct(
      LAWYER,
      "view_profile",
      { type: "person", id: PRINCIPAL_A },
      { organizationId: ORG_1 },
    );
    expect(res.allowed).toBe(false);
  });

  it("keeps a fund-scoped delegation inside its own fund", async () => {
    delegation({ scope_type: "fund", scope_id: FUND_A }, ["view_investments"]);
    await expect(
      canAct(LAWYER, "view_investments", { type: "investment", id: INVESTMENT_A }),
    ).resolves.toMatchObject({ allowed: true });
    // Swapping in another fund's investment id must not cross the scope.
    await expect(
      canAct(LAWYER, "view_investments", { type: "investment", id: INVESTMENT_B }),
    ).resolves.toMatchObject({ allowed: false });
  });

  it("keeps a profile-scoped delegation off another profile", async () => {
    delegation({ delegate_user_id: OTHER_PRO, scope_type: "investment_profile", scope_id: PROFILE_A }, [
      "view_profile",
    ]);
    memberships.length = 0;
    await expect(
      canAct(OTHER_PRO, "view_profile", { type: "investment_profile", id: PROFILE_B }),
    ).resolves.toMatchObject({ allowed: false });
  });

  it("refuses a resource that does not exist", async () => {
    const res = await canAct(LAWYER, "view_profile", {
      type: "person",
      id: "99999999-9999-4999-8999-999999999999",
    });
    expect(res.reason).toMatch(/not found/i);
  });

  it("writes nothing while deciding", () => {
    expect(writes.filter((w) => w.op !== "insert" || w.table !== "delegation_audit_events")).toHaveLength(0);
  });
});

describe("authority is a ceiling, not a grant", () => {
  it("assist authority cannot sign", () => {
    expect(capabilityAllowedAtAuthority("sign_specified_documents", "assist")).toBe(false);
  });

  it("signatory authority does not imply money movement", () => {
    expect(capabilityAllowedAtAuthority("initiate_investment", "authorized_signatory")).toBe(false);
    expect(capabilityAllowedAtAuthority("view_wire_instructions", "authorized_signatory")).toBe(false);
  });

  it("transaction authority without the permission row authorizes nothing", async () => {
    delegation({ delegate_user_id: OTHER_PRO, authority_level: "transaction_authority" }, [
      "view_profile",
    ]);
    const res = await canAct(OTHER_PRO, "initiate_investment", {
      type: "investment",
      id: INVESTMENT_A,
    });
    expect(res.allowed).toBe(false);
  });

  it("view authority cannot exercise assist capabilities", () => {
    expect(capabilityAllowedAtAuthority("upload_documents", "view")).toBe(false);
    expect(capabilityAllowedAtAuthority("view_documents", "view")).toBe(true);
  });
});

const migrationSql = readdirSync(join(process.cwd(), "drizzle", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(process.cwd(), "drizzle", "migrations", f), "utf8"))
  .join("\n");

describe("database policies", () => {
  const newTables = [
    "professional_organizations",
    "professional_memberships",
    "delegations",
    "delegation_permissions",
    "delegation_audit_events",
  ];

  it("enables row level security on every new table", () => {
    for (const table of newTables) {
      expect(migrationSql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  it("creates no broad FOR ALL TO authenticated policy", () => {
    expect(migrationSql).not.toMatch(/FOR ALL TO authenticated/i);
  });

  it("grants authenticated users read access only", () => {
    for (const table of newTables) {
      expect(migrationSql).toContain(`GRANT SELECT ON public.${table} TO authenticated;`);
      expect(migrationSql).not.toContain(`GRANT INSERT ON public.${table} TO authenticated`);
      expect(migrationSql).not.toContain(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON public.${table} TO authenticated`,
      );
    }
  });
});
