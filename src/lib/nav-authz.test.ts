import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adversarial authorization tests for the NAV engine.
 *
 * Every id here arrives "from the browser". The server must re-read the NAV
 * version and authorise against the fund it actually belongs to, so swapping
 * a NAV id or a fund id never crosses a boundary, and no single person can
 * prepare, review, approve and publish the same NAV.
 */

const FUND_A = "11111111-1111-4111-8111-111111111111";
const FUND_B = "22222222-2222-4222-8222-222222222222";
const BOOK_A = "bbbb1111-1111-4111-8111-111111111111";
const NAV_A_DRAFT = "dddd1111-1111-4111-8111-111111111111";
const NAV_A_REVIEW = "dddd1111-2222-4222-8222-222222222222";
const NAV_A_PUBLISHED = "dddd1111-3333-4333-8333-333333333333";
const NAV_B = "dddd2222-2222-4222-8222-222222222222";

const MANAGER_A = "manager-a";
const MANAGER_B = "manager-b";
const PREPARER = "admin-preparer";
const REVIEWER = "admin-reviewer";
const PUBLISHER = "admin-publisher";

type Write = { table: string; op: string; payload: any };
let writes: Write[] = [];

const cleanChecks = [
  { code: "ledger_balanced", severity: "pass", detail: "Balanced.", overridable: false },
];

const navRow = (over: Record<string, unknown>) => ({
  book_id: BOOK_A,
  offering_id: FUND_A,
  as_of_date: "2026-06-30",
  version: 1,
  frequency: "quarterly",
  methodology_version: "v1",
  source_cutoff_at: "2026-07-01T00:00:00Z",
  net_asset_value_cents: 10_000_000,
  prior_nav_cents: 9_000_000,
  checks: cleanChecks,
  overrides: [],
  bridge: { reconciles: true, differenceCents: 0, lines: [] },
  inputs_snapshot: { balances: [] },
  valuation_versions: [],
  prepared_by: PREPARER,
  reviewed_by: null,
  approved_by: null,
  manager_approved_by: null,
  ...over,
});

const tables: Record<string, any[]> = {
  user_roles: [
    { user_id: MANAGER_A, role: "fund_manager" },
    { user_id: MANAGER_B, role: "fund_manager" },
    { user_id: PREPARER, role: "admin" },
    { user_id: REVIEWER, role: "admin" },
    { user_id: PUBLISHER, role: "admin" },
  ],
  fund_managers: [
    { user_id: MANAGER_A, offering_id: FUND_A },
    { user_id: MANAGER_B, offering_id: FUND_B },
  ],
  offerings: [
    { id: FUND_A, name: "Fund A" },
    { id: FUND_B, name: "Fund B" },
  ],
  nav_policies: [],
  nav_checks: [],
  nav_events: [],
  nav_versions: [
    navRow({ id: NAV_A_DRAFT, status: "draft" }),
    navRow({ id: NAV_A_REVIEW, status: "review", version: 2 }),
    navRow({
      id: NAV_A_PUBLISHED,
      status: "published",
      version: 3,
      reviewed_by: REVIEWER,
      approved_by: REVIEWER,
      published_by: REVIEWER,
    }),
    navRow({ id: NAV_B, offering_id: FUND_B, status: "review" }),
  ],
};

function builder(table: string) {
  let rows = [...(tables[table] ?? [])];
  const api: any = {
    select: () => api,
    order: () => api,
    limit: () => api,
    is: () => api,
    not: () => api,
    lte: (col: string, val: any) => {
      rows = rows.filter((r) => r[col] <= val);
      return api;
    },
    gte: (col: string, val: any) => {
      rows = rows.filter((r) => r[col] >= val);
      return api;
    },
    eq: (col: string, val: unknown) => {
      rows = rows.filter((r) => r[col] === val);
      return api;
    },
    in: (col: string, vals: unknown[]) => {
      rows = rows.filter((r) => vals.includes(r[col]));
      return api;
    },
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve: any) => resolve({ data: rows, error: null, count: rows.length }),
    insert: (payload: any) => {
      writes.push({ table, op: "insert", payload });
      const created = { id: `new-${table}`, ...payload };
      return {
        select: () => ({ single: () => Promise.resolve({ data: created, error: null }) }),
        then: (resolve: any) => resolve({ data: created, error: null }),
      };
    },
    update: (payload: any) => {
      writes.push({ table, op: "update", payload });
      return api;
    },
    delete: () => {
      writes.push({ table, op: "delete", payload: null });
      return api;
    },
  };
  return api;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => builder(table) },
}));

vi.mock("@/lib/accounting.server", () => ({
  ledgerBookForOffering: async () => ({ id: BOOK_A }),
  registerReport: vi.fn(async () => ({ id: "report-1" })),
}));

import {
  approveNav,
  calculateNAV,
  getNAVBridge,
  managerRespondToNav,
  navHistory,
  navQueue,
  overrideNavCheck,
  publishNav,
  reviewNav,
  reviseNav,
  submitNavForReview,
} from "./nav.server";

beforeEach(() => {
  writes = [];
});

describe("fund isolation", () => {
  it("shows a manager only the NAVs of funds they manage", async () => {
    const queue = await navQueue(MANAGER_A);
    expect(queue.navs.every((n: any) => n.offering_id === FUND_A)).toBe(true);
    expect(queue.funds.map((f: any) => f.id)).toEqual([FUND_A]);
    expect(queue.isStaff).toBe(false);
  });

  it("refuses a manager a queue or history for another fund", async () => {
    await expect(navQueue(MANAGER_A, FUND_B)).rejects.toThrow(/do not manage|forbidden/i);
    await expect(navHistory(MANAGER_A, FUND_B)).rejects.toThrow(/do not manage|forbidden/i);
  });

  it("refuses a substituted NAV id belonging to another fund", async () => {
    await expect(getNAVBridge(MANAGER_A, NAV_B)).rejects.toThrow(/do not manage|forbidden/i);
    await expect(
      managerRespondToNav(MANAGER_B, NAV_A_REVIEW, "acknowledge"),
    ).rejects.toThrow(/do not manage|forbidden/i);
    expect(writes).toHaveLength(0);
  });
});

describe("managers never author NAV", () => {
  it("refuses a manager calculating, submitting, approving or publishing", async () => {
    await expect(
      calculateNAV(MANAGER_A, { offeringId: FUND_A, asOfDate: "2026-06-30" }),
    ).rejects.toThrow(/Harmonious/i);
    await expect(submitNavForReview(MANAGER_A, NAV_A_DRAFT)).rejects.toThrow(/Harmonious/i);
    await expect(approveNav(MANAGER_A, NAV_A_REVIEW)).rejects.toThrow(/Harmonious/i);
    await expect(publishNav(MANAGER_A, NAV_A_REVIEW)).rejects.toThrow(/Harmonious/i);
    expect(writes).toHaveLength(0);
  });

  it("refuses a manager response that changes a published NAV", async () => {
    await expect(
      managerRespondToNav(MANAGER_A, NAV_A_PUBLISHED, "challenge", "wrong"),
    ).rejects.toThrow(/published NAV cannot be changed|does not allow/i);
  });
});

describe("segregation of duties", () => {
  it("will not let the preparer review or approve their own NAV", async () => {
    await expect(reviewNav(PREPARER, NAV_A_REVIEW)).rejects.toThrow(/prepared/i);
    await expect(approveNav(PREPARER, NAV_A_REVIEW)).rejects.toThrow(/prepared/i);
    expect(writes).toHaveLength(0);
  });

  it("will not approve a NAV nobody has reviewed", async () => {
    await expect(approveNav(REVIEWER, NAV_A_REVIEW)).rejects.toThrow(/review/i);
  });
});

describe("publication is final", () => {
  it("refuses to publish a NAV that is not approved", async () => {
    await expect(publishNav(REVIEWER, NAV_A_DRAFT)).rejects.toThrow(/cannot move to published|approve/i);
  });

  it("refuses to publish an already published NAV", async () => {
    await expect(publishNav(PUBLISHER, NAV_A_PUBLISHED)).rejects.toThrow(
      /cannot move to published/i,
    );
  });

  it("refuses to override an integrity failure, or to override without a reason", async () => {
    await expect(
      overrideNavCheck(REVIEWER, NAV_A_DRAFT, "ledger_imbalance", "a long documented reason here"),
    ).rejects.toThrow(/never be overridden/i);
    await expect(
      overrideNavCheck(REVIEWER, NAV_A_DRAFT, "unreconciled_cash", "because"),
    ).rejects.toThrow(/documented reason/i);
    await expect(
      overrideNavCheck(REVIEWER, NAV_A_PUBLISHED, "unreconciled_cash", "a long documented reason"),
    ).rejects.toThrow(/published NAV cannot be changed/i);
  });

  it("only revises a published NAV, and only with a stated reason", async () => {
    await expect(reviseNav(REVIEWER, NAV_A_REVIEW, "a proper stated reason")).rejects.toThrow(
      /published NAV is revised/i,
    );
    await expect(reviseNav(REVIEWER, NAV_A_PUBLISHED, "no")).rejects.toThrow(/stated reason/i);
  });
});

// ------------------------------------------------- database-level guarantees

const migrationSql = readdirSync(join(process.cwd(), "drizzle", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(process.cwd(), "drizzle", "migrations", f), "utf8"))
  .join("\n");

describe("database guarantees", () => {
  it("gives fund managers read-only access to the NAV tables", () => {
    for (const table of ["nav_versions", "nav_policies", "nav_checks", "nav_events"]) {
      expect(migrationSql).not.toMatch(
        new RegExp(`on public\\.${table}\\s+for all to authenticated`, "i"),
      );
    }
  });

  it("scopes every NAV read to funds the reader actually manages", () => {
    const policies =
      migrationSql.match(/create policy "[^"]*nav[^"]*" on public\.nav_[a-z_]+[\s\S]*?;/gi) ?? [];
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).toMatch(/is_any_staff\(\)|manages_offering|investor_applications|private\./i);
    }
  });

  it("freezes a published NAV and keeps its history append-only", () => {
    expect(migrationSql).toMatch(/published NAV/i);
    expect(migrationSql).toMatch(/nav_events/i);
    expect(migrationSql).toMatch(/protect_published_nav/i);
  });

  it("allows only one published NAV per fund and date", () => {
    expect(migrationSql).toMatch(/nav_versions[\s\S]{0,200}status = 'published'/i);
  });
});
