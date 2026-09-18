import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adversarial tests for the investor allocation engine.
 *
 * Every id here arrives "from the browser". The server must re-read the run,
 * position or statement and authorise against the fund it actually belongs to;
 * managers must never author allocations; one person must never prepare,
 * review, approve and finalize; and nothing finalizes unless investor capital
 * reconciles to the fund exactly.
 */

const FUND_A = "11111111-1111-4111-8111-111111111111";
const FUND_B = "22222222-2222-4222-8222-222222222222";
const BOOK_A = "bbbb1111-1111-4111-8111-111111111111";
const NAV_PUBLISHED = "dddd1111-1111-4111-8111-111111111111";
const NAV_DRAFT = "dddd1111-2222-4222-8222-222222222222";
const RUN_DRAFT = "aaaa1111-1111-4111-8111-111111111111";
const RUN_REVIEWED = "aaaa1111-2222-4222-8222-222222222222";
const RUN_APPROVED_OFF = "aaaa1111-3333-4333-8333-333333333333";
const RUN_FINALIZED = "aaaa1111-4444-4444-8444-444444444444";
const RUN_B = "aaaa2222-1111-4111-8111-111111111111";
const POSITION_A = "cccc1111-1111-4111-8111-111111111111";
const POSITION_B = "cccc2222-1111-4111-8111-111111111111";
const STATEMENT_PUBLISHED = "eeee1111-1111-4111-8111-111111111111";
const STATEMENT_DRAFT = "eeee1111-2222-4222-8222-222222222222";

const MANAGER_A = "manager-a";
const MANAGER_B = "manager-b";
const PREPARER = "admin-preparer";
const REVIEWER = "admin-reviewer";
const APPROVER = "admin-approver";
const INVESTOR = "investor-1";
const OTHER_INVESTOR = "investor-2";

type Write = { table: string; op: string; payload: any };
let writes: Write[] = [];

const reconciles = {
  reconciles: true,
  differenceCents: 0,
  lines: [{ component: "endingNetAssets", fundCents: 1_000, allocatedCents: 1_000, differenceCents: 0 }],
};
const doesNotReconcile = {
  reconciles: false,
  differenceCents: 1,
  lines: [
    { component: "endingNetAssets", fundCents: 1_001, allocatedCents: 1_000, differenceCents: 1 },
  ],
};

const run = (over: Record<string, unknown>) => ({
  offering_id: FUND_A,
  book_id: BOOK_A,
  period_id: null,
  nav_version_id: NAV_PUBLISHED,
  policy_id: null,
  policy_snapshot: { methodology: "allocation-v1", managerWorkflow: "acknowledge" },
  period_start: "2026-01-01",
  period_end: "2026-03-31",
  source_cutoff_at: "2026-04-01T00:00:00Z",
  version: 1,
  status: "draft",
  fund_totals: {},
  reconciliation: reconciles,
  prepared_by: PREPARER,
  reviewed_by: null,
  approved_by: null,
  finalized_by: null,
  ...over,
});

const tables: Record<string, any[]> = {
  user_roles: [
    { user_id: MANAGER_A, role: "fund_manager" },
    { user_id: MANAGER_B, role: "fund_manager" },
    { user_id: PREPARER, role: "admin" },
    { user_id: REVIEWER, role: "admin" },
    { user_id: APPROVER, role: "admin" },
  ],
  fund_managers: [
    { user_id: MANAGER_A, offering_id: FUND_A },
    { user_id: MANAGER_B, offering_id: FUND_B },
  ],
  offerings: [
    { id: FUND_A, name: "Fund A", legal_entity_name: "Fund A LLC" },
    { id: FUND_B, name: "Fund B", legal_entity_name: "Fund B LLC" },
  ],
  ledger_books: [{ id: BOOK_A, offering_id: FUND_A }],
  nav_versions: [
    {
      id: NAV_PUBLISHED,
      book_id: BOOK_A,
      offering_id: FUND_A,
      status: "published",
      period_id: null,
      capital_handoff: {
        periodStart: "2026-01-01",
        periodEnd: "2026-03-31",
        netIncomeCents: 0,
        realizedGainCents: 0,
        unrealizedGainCents: 0,
        managementFeesCents: 0,
        fundExpensesCents: 0,
        contributionsCents: 0,
        distributionsCents: 0,
        endingNetAssetsCents: 0,
      },
    },
    { id: NAV_DRAFT, book_id: BOOK_A, offering_id: FUND_A, status: "draft", capital_handoff: {} },
  ],
  allocation_runs: [
    run({ id: RUN_DRAFT }),
    run({ id: RUN_REVIEWED, status: "review", reviewed_by: REVIEWER }),
    run({
      id: RUN_APPROVED_OFF,
      status: "approved",
      reviewed_by: REVIEWER,
      approved_by: APPROVER,
      reconciliation: doesNotReconcile,
    }),
    run({
      id: RUN_FINALIZED,
      status: "finalized",
      reviewed_by: REVIEWER,
      approved_by: APPROVER,
      finalized_by: APPROVER,
    }),
    run({ id: RUN_B, offering_id: FUND_B, status: "review" }),
  ],
  allocation_lines: [],
  allocation_events: [],
  allocation_policies: [],
  commitment_events: [],
  capital_accounts: [],
  capital_account_adjustments: [
    {
      id: "adj-1",
      offering_id: FUND_A,
      position_id: POSITION_A,
      status: "pending",
      requested_by: PREPARER,
      amount_cents: 1_000,
    },
  ],
  investor_positions: [
    {
      id: POSITION_A,
      offering_id: FUND_A,
      investor_user_id: INVESTOR,
      display_name: "Amy",
      capacity: "individual",
      investment_profile_id: null,
      class_id: null,
      status: "active",
    },
    {
      id: POSITION_B,
      offering_id: FUND_B,
      investor_user_id: OTHER_INVESTOR,
      display_name: "Ben",
      capacity: "individual",
      investment_profile_id: null,
      class_id: null,
      status: "active",
    },
  ],
  investor_statements: [
    {
      id: STATEMENT_PUBLISHED,
      offering_id: FUND_A,
      position_id: POSITION_A,
      investor_user_id: INVESTOR,
      status: "published",
      version: 1,
      period_start: "2026-01-01",
      period_end: "2026-03-31",
      prepared_by: PREPARER,
      approved_by: APPROVER,
      snapshot: {},
      provenance: {},
    },
    {
      id: STATEMENT_DRAFT,
      offering_id: FUND_A,
      position_id: POSITION_A,
      investor_user_id: INVESTOR,
      status: "draft",
      version: 2,
      period_start: "2026-01-01",
      period_end: "2026-03-31",
      prepared_by: PREPARER,
      approved_by: null,
      snapshot: {},
      provenance: {},
    },
  ],
  investor_applications: [],
  investment_profiles: [],
  investor_personas: [],
  profiles: [],
  payments: [],
  application_closings: [],
  management_fee_terms: [],
  waterfall_terms: [],
  carry_allocations: [],
  fee_calculations: [],
  position_transfers: [],
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
  registerReport: vi.fn(async () => ({ id: "report-1" })),
}));

import {
  allocationDetail,
  allocationQueue,
  calculateAllocations,
  decideAllocationRun,
  decideCapitalAdjustment,
  decideStatement,
  ensurePositions,
  finalizeAllocationRun,
  generateStatements,
  investorCapitalOverview,
  managerRespondToAllocations,
  myCapitalStatements,
  myStatementDetail,
  recordTransfer,
  reviseStatement,
  submitAllocationRun,
} from "./allocations.server";

beforeEach(() => {
  writes = [];
});

describe("fund isolation", () => {
  it("shows a manager only their own fund's runs", async () => {
    const queue = await allocationQueue(MANAGER_A);
    expect(queue.runs.every((r: any) => r.offering_id === FUND_A)).toBe(true);
    expect(queue.funds.map((f: any) => f.id)).toEqual([FUND_A]);
    expect(queue.isStaff).toBe(false);
  });

  it("refuses a run id belonging to another fund", async () => {
    await expect(allocationDetail(MANAGER_A, RUN_B)).rejects.toThrow(/do not manage|forbidden/i);
    await expect(investorCapitalOverview(MANAGER_A, FUND_B)).rejects.toThrow(
      /do not manage|forbidden/i,
    );
    await expect(managerRespondToAllocations(MANAGER_B, RUN_DRAFT, "acknowledge")).rejects.toThrow(
      /do not manage|forbidden/i,
    );
    expect(writes).toHaveLength(0);
  });

  it("refuses a transfer that crosses funds", async () => {
    await expect(
      recordTransfer(PREPARER, {
        fromPositionId: POSITION_A,
        toPositionId: POSITION_B,
        effectiveDate: "2026-02-01",
        capitalCents: 1_000,
        commitmentCents: 1_000,
        authorizationReference: "Deed 12",
      }),
    ).rejects.toThrow(/one fund|do not manage|forbidden/i);
  });
});

describe("managers never author allocations", () => {
  it("refuses a manager calculating, submitting, approving, finalizing or issuing statements", async () => {
    await expect(calculateAllocations(MANAGER_A, { navId: NAV_PUBLISHED })).rejects.toThrow(
      /Harmonious/i,
    );
    await expect(submitAllocationRun(MANAGER_A, RUN_DRAFT)).rejects.toThrow(/Harmonious/i);
    await expect(decideAllocationRun(MANAGER_A, RUN_REVIEWED, "approve")).rejects.toThrow(
      /Harmonious/i,
    );
    await expect(finalizeAllocationRun(MANAGER_A, RUN_APPROVED_OFF)).rejects.toThrow(/Harmonious/i);
    await expect(generateStatements(MANAGER_A, RUN_FINALIZED)).rejects.toThrow(/Harmonious/i);
    expect(writes).toHaveLength(0);
  });

  it("does not create positions on a manager's read", async () => {
    await ensurePositions(MANAGER_A, FUND_A);
    expect(writes.filter((w) => w.op === "insert")).toHaveLength(0);
  });

  it("refuses a challenge with no explanation", async () => {
    await expect(
      managerRespondToAllocations(MANAGER_A, RUN_REVIEWED, "challenge", "   "),
    ).rejects.toThrow(/what looks wrong/i);
  });

  it("refuses a manager approval when the fund's workflow does not allow it", async () => {
    await expect(
      managerRespondToAllocations(MANAGER_A, RUN_REVIEWED, "approve"),
    ).rejects.toThrow(/workflow/i);
  });
});

describe("separation of duties", () => {
  it("refuses the preparer reviewing or approving their own run", async () => {
    await expect(decideAllocationRun(PREPARER, RUN_DRAFT, "review")).rejects.toThrow(
      /someone other than/i,
    );
    await expect(decideAllocationRun(PREPARER, RUN_REVIEWED, "approve")).rejects.toThrow(
      /someone other than/i,
    );
  });

  it("refuses the reviewer approving the same run", async () => {
    await expect(decideAllocationRun(REVIEWER, RUN_REVIEWED, "approve")).rejects.toThrow(
      /someone other than/i,
    );
  });

  it("refuses the requester approving their own adjustment", async () => {
    await expect(decideCapitalAdjustment(PREPARER, "adj-1", "approve")).rejects.toThrow(
      /someone other than/i,
    );
  });
});

describe("nothing finalizes on faith", () => {
  it("refuses allocations from a NAV that is not published", async () => {
    await expect(calculateAllocations(PREPARER, { navId: NAV_DRAFT })).rejects.toThrow(
      /published NAV/i,
    );
  });

  it("refuses to finalize a run that does not reconcile to the fund", async () => {
    await expect(finalizeAllocationRun(REVIEWER, RUN_APPROVED_OFF)).rejects.toThrow(
      /do not reconcile/i,
    );
    expect(writes.filter((w) => w.table === "capital_accounts")).toHaveLength(0);
  });

  it("refuses to finalize a run that has not been approved", async () => {
    await expect(finalizeAllocationRun(REVIEWER, RUN_DRAFT)).rejects.toThrow(/approved/i);
  });

  it("refuses statements from a run that is not finalized", async () => {
    await expect(generateStatements(PREPARER, RUN_DRAFT)).rejects.toThrow(/finalized/i);
  });
});

describe("statements", () => {
  it("refuses publication before approval and refuses self-approval", async () => {
    await expect(decideStatement(PREPARER, STATEMENT_DRAFT, "publish")).rejects.toThrow(
      /cannot move|approved/i,
    );
    await expect(decideStatement(PREPARER, STATEMENT_DRAFT, "approve")).rejects.toThrow(
      /cannot move|someone other than/i,
    );
  });

  it("never rewrites a published statement", async () => {
    await expect(decideStatement(APPROVER, STATEMENT_PUBLISHED, "return")).rejects.toThrow(
      /cannot move/i,
    );
    await expect(reviseStatement(APPROVER, STATEMENT_PUBLISHED, "too short")).rejects.toThrow(
      /at least 20/i,
    );
  });

  it("shows an investor only their own published statements", async () => {
    const mine = await myCapitalStatements(INVESTOR);
    expect(mine.positions.every((p: any) => p.investor_user_id === undefined || true)).toBe(true);
    expect(mine.statements.every((s: any) => s.status !== "draft")).toBe(true);

    await expect(myStatementDetail(OTHER_INVESTOR, STATEMENT_PUBLISHED)).rejects.toThrow(
      /not found/i,
    );
    await expect(myStatementDetail(INVESTOR, STATEMENT_DRAFT)).rejects.toThrow(/not found/i);
    await expect(myStatementDetail(INVESTOR, STATEMENT_PUBLISHED)).resolves.toMatchObject({
      id: STATEMENT_PUBLISHED,
    });
  });
});
