import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adversarial authorization tests for performance reporting.
 *
 * Every id here arrives "from the browser". The server must re-read the record
 * and authorise against the fund it actually belongs to, one person may not
 * prepare, review, approve and publish the same numbers, and a published
 * performance report is never rewritten.
 */

const FUND_A = "11111111-1111-4111-8111-111111111111";
const FUND_B = "22222222-2222-4222-8222-222222222222";
const BOOK_A = "bbbb1111-1111-4111-8111-111111111111";

const RUN_A_PREPARED = "aaaa1111-1111-4111-8111-111111111111";
const RUN_A_REVIEW = "aaaa1111-2222-4222-8222-222222222222";
const RUN_A_APPROVED = "aaaa1111-3333-4333-8333-333333333333";
const RUN_A_BLOCKED = "aaaa1111-6666-4666-8666-666666666666";
const RUN_A_PUBLISHED = "aaaa1111-4444-4444-8444-444444444444";
const RUN_A_UNSHARED = "aaaa1111-5555-4555-8555-555555555555";
const RUN_B = "bbbb2222-2222-4222-8222-222222222222";

const MANAGER_A = "manager-a";
const MANAGER_B = "manager-b";
const PREPARER = "admin-preparer";
const REVIEWER = "admin-reviewer";
const PUBLISHER = "admin-publisher";
const INVESTOR = "investor-amy";
const OTHER_INVESTOR = "investor-ben";

type Write = { table: string; op: string; payload: any };
let writes: Write[] = [];

const run = (over: Record<string, unknown>) => ({
  offering_id: FUND_A,
  book_id: BOOK_A,
  period_kind: "quarter",
  period_start: "2026-01-01",
  period_end: "2026-03-31",
  period_label: "Q1 2026",
  status: "prepared",
  version: 1,
  fund_type: "venture",
  methodology_version: "venture-v1",
  methodology_snapshot: {},
  nav_version_id: "nav-1",
  beginning_nav_version_id: "nav-0",
  allocation_run_id: "alloc-1",
  source_cutoff_at: "2026-04-02T00:00:00Z",
  beginning_value_cents: 1_000_000,
  ending_value_cents: 1_100_000,
  gross_return_bps: 1000,
  net_return_bps: 900,
  irr_bps: 1200,
  irr_status: "solved",
  moic: 1.1,
  bridge: { reconciles: true, lines: [] },
  exceptions: [],
  inputs_snapshot: {},
  manager_visible: false,
  investor_visible: false,
  prepared_by: PREPARER,
  reviewed_by: null,
  approved_by: null,
  published_by: null,
  supersedes_id: null,
  ...over,
});

const line = (over: Record<string, unknown>) => ({
  run_id: RUN_A_PUBLISHED,
  offering_id: FUND_A,
  position_id: "pos-a",
  investor_user_id: INVESTOR,
  display_name: "Amy",
  capacity: "individual",
  paid_in_capital_cents: 1_000_000,
  ending_capital_cents: 1_100_000,
  realized_value_cents: 0,
  total_value_cents: 1_100_000,
  net_return_bps: 900,
  gross_return_bps: 1000,
  irr_bps: 1100,
  irr_status: "solved",
  moic: 1.1,
  created_at: "2026-04-10T00:00:00Z",
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
    { id: FUND_A, name: "Fund A", offering_kind: "fund" },
    { id: FUND_B, name: "Fund B", offering_kind: "fund" },
  ],
  performance_runs: [
    run({ id: RUN_A_PREPARED }),
    run({ id: RUN_A_REVIEW, status: "review", version: 2, reviewed_by: REVIEWER }),
    run({
      id: RUN_A_APPROVED,
      status: "approved",
      version: 3,
      reviewed_by: REVIEWER,
      approved_by: REVIEWER,
    }),
    run({
      id: RUN_A_BLOCKED,
      status: "approved",
      version: 4,
      reviewed_by: REVIEWER,
      approved_by: REVIEWER,
      exceptions: [
        { kind: "bridge_unreconciled", severity: "blocking", detail: "Bridge does not reconcile." },
      ],
    }),
    run({
      id: RUN_A_PUBLISHED,
      status: "published",
      version: 5,
      reviewed_by: REVIEWER,
      approved_by: REVIEWER,
      published_by: PUBLISHER,
      published_at: "2026-04-10T00:00:00Z",
      manager_visible: true,
      investor_visible: true,
    }),
    run({
      id: RUN_A_UNSHARED,
      status: "published",
      version: 6,
      reviewed_by: REVIEWER,
      approved_by: REVIEWER,
      published_by: PUBLISHER,
      manager_visible: false,
    }),
    run({ id: RUN_B, offering_id: FUND_B, status: "review" }),
  ],
  performance_lines: [
    line({ id: "line-a" }),
    line({ id: "line-b", investor_user_id: OTHER_INVESTOR, position_id: "pos-b", display_name: "Ben" }),
    line({ id: "line-hidden", run_id: RUN_A_UNSHARED }),
  ],
  performance_events: [],
  performance_configs: [
    {
      id: "cfg-a",
      offering_id: FUND_A,
      book_id: BOOK_A,
      fund_type: "venture",
      enabled_metrics: [],
      default_frequency: "quarter",
      blocking_exception_kinds: [],
      large_movement_threshold_bps: 5000,
    },
  ],
  performance_methodologies: [
    {
      id: "meth-1",
      offering_id: FUND_A,
      book_id: BOOK_A,
      version: 1,
      fund_type: "venture",
      label: "Venture v1",
      status: "active",
      effective_from: "2020-01-01",
      effective_to: "2999-12-31",
      metrics: [],
    },
  ],
  performance_benchmarks: [],
  investor_positions: [
    { id: "pos-a", offering_id: FUND_A, investor_user_id: INVESTOR },
    { id: "pos-b", offering_id: FUND_B, investor_user_id: OTHER_INVESTOR },
  ],
  financial_reports: [],
};

function builder(table: string) {
  let rows = [...(tables[table] ?? [])];
  const api: any = {
    select: () => api,
    order: () => api,
    limit: () => api,
    is: () => api,
    not: () => api,
    neq: (col: string, val: unknown) => {
      rows = rows.filter((r) => r[col] !== val);
      return api;
    },
    lte: (col: string, val: any) => {
      rows = rows.filter((r) => r[col] <= val);
      return api;
    },
    gte: (col: string, val: any) => {
      rows = rows.filter((r) => r[col] >= val);
      return api;
    },
    lt: (col: string, val: any) => {
      rows = rows.filter((r) => r[col] < val);
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
      const created = { id: `new-${table}`, ...(Array.isArray(payload) ? payload[0] : payload) };
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
  ledgerBookForOffering: async () => ({ id: BOOK_A, offering_id: FUND_A }),
  registerReport: async () => ({ id: "report-1" }),
}));

const server = await import("@/lib/performance.server");

beforeEach(() => {
  writes = [];
});

const updates = (table: string) => writes.filter((w) => w.table === table && w.op === "update");

describe("fund isolation", () => {
  it("stops a manager opening another fund's performance", async () => {
    await expect(server.performanceRunDetail(MANAGER_B, RUN_A_PUBLISHED)).rejects.toThrow();
  });

  it("lets the fund's own manager open a published, shared report", async () => {
    const detail = await server.performanceRunDetail(MANAGER_A, RUN_A_PUBLISHED);
    expect(detail.run.id).toBe(RUN_A_PUBLISHED);
  });

  it("hides an unpublished report from the fund's manager", async () => {
    await expect(server.performanceRunDetail(MANAGER_A, RUN_A_PREPARED)).rejects.toThrow(
      /not been published/,
    );
  });

  it("hides a published report that has not been shared", async () => {
    await expect(server.performanceRunDetail(MANAGER_A, RUN_A_UNSHARED)).rejects.toThrow(
      /not been shared/,
    );
  });

  it("gives Harmonious the internal event trail managers never see", async () => {
    const staff = await server.performanceRunDetail(PUBLISHER, RUN_A_PREPARED);
    expect(Array.isArray(staff.events)).toBe(true);
    const manager = await server.performanceRunDetail(MANAGER_A, RUN_A_PUBLISHED);
    expect(manager.events).toEqual([]);
  });
});

describe("authorship and segregation", () => {
  it("refuses to let a fund manager prepare performance", async () => {
    await expect(
      server.preparePerformance(MANAGER_A, {
        offeringId: FUND_A,
        periodKind: "quarter",
        periodEnd: "2026-03-31",
      }),
    ).rejects.toThrow(/Harmonious/);
  });

  it("refuses to let a fund manager advance a report", async () => {
    await expect(server.advancePerformanceRun(MANAGER_A, RUN_A_PREPARED, "review")).rejects.toThrow(
      /Harmonious/,
    );
  });

  it("stops the preparer reviewing their own numbers", async () => {
    await expect(server.advancePerformanceRun(PREPARER, RUN_A_PREPARED, "review")).rejects.toThrow();
  });

  it("stops the preparer approving their own numbers", async () => {
    await expect(server.advancePerformanceRun(PREPARER, RUN_A_REVIEW, "approved")).rejects.toThrow(
      /other than its preparer/,
    );
  });

  it("allows a different person to review and then a third to approve", async () => {
    await server.advancePerformanceRun(REVIEWER, RUN_A_PREPARED, "review");
    expect(updates("performance_runs")[0]!.payload.reviewed_by).toBe(REVIEWER);
    writes = [];
    await server.advancePerformanceRun(PUBLISHER, RUN_A_REVIEW, "approved");
    expect(updates("performance_runs")[0]!.payload.approved_by).toBe(PUBLISHER);
  });

  it("refuses an illegal status jump", async () => {
    await expect(server.advancePerformanceRun(PUBLISHER, RUN_A_PREPARED, "published")).rejects.toThrow(
      /cannot move to published/,
    );
  });
});

describe("publication", () => {
  it("blocks publication while a blocking exception is open", async () => {
    await expect(server.advancePerformanceRun(PUBLISHER, RUN_A_BLOCKED, "published")).rejects.toThrow(
      /reconcile/,
    );
  });

  it("publishes an approved, clean report and registers it", async () => {
    await server.advancePerformanceRun(PUBLISHER, RUN_A_APPROVED, "published");
    const patch = updates("performance_runs")[0]!.payload;
    expect(patch.status).toBe("published");
    expect(patch.published_by).toBe(PUBLISHER);
    expect(patch.manager_visible).toBe(true);
  });

  it("never rewrites a published report — a correction supersedes it", async () => {
    await expect(server.advancePerformanceRun(PUBLISHER, RUN_A_PUBLISHED, "approved")).rejects.toThrow();
    await expect(server.revisePerformanceRun(PUBLISHER, RUN_A_PUBLISHED, "short")).rejects.toThrow();
  });

  it("keeps the service role out of human approvals", async () => {
    await expect(
      server.advancePerformanceRun("service_role", RUN_A_PREPARED, "review"),
    ).rejects.toThrow(/Forbidden/);
  });
});

describe("manager response", () => {
  it("only accepts a response on a published report", async () => {
    await expect(
      server.managerRespondToPerformance(MANAGER_A, RUN_A_PREPARED, "acknowledged"),
    ).rejects.toThrow(/published/);
  });

  it("requires an explanation with a challenge", async () => {
    await expect(
      server.managerRespondToPerformance(MANAGER_A, RUN_A_PUBLISHED, "challenged", "no"),
    ).rejects.toThrow(/describe/);
  });

  it("records an acknowledgement without changing any figure", async () => {
    await server.managerRespondToPerformance(MANAGER_A, RUN_A_PUBLISHED, "acknowledged");
    const patch = updates("performance_runs")[0]!.payload;
    expect(patch.manager_response).toBe("acknowledged");
    expect(Object.keys(patch)).not.toContain("net_return_bps");
  });

  it("stops another fund's manager responding", async () => {
    await expect(
      server.managerRespondToPerformance(MANAGER_B, RUN_A_PUBLISHED, "acknowledged"),
    ).rejects.toThrow();
  });
});

describe("investor exposure", () => {
  it("shows an investor only their own position", async () => {
    const view = await server.investorPerformanceView(INVESTOR);
    expect(view.investments).toHaveLength(1);
    expect(view.investments[0]!.displayName).toBe("Amy");
    const names = JSON.stringify(view);
    expect(names).not.toContain("Ben");
  });

  it("separates the investor's own figures from the fund's", async () => {
    const view = await server.investorPerformanceView(INVESTOR);
    const period = view.investments[0]!.periods[0]!;
    expect(period.yourInvestment.contributedCents).toBe(1_000_000);
    expect(period.fundLevel.netAssetsCents).toBe(1_100_000);
    expect(period.yourInvestment).not.toHaveProperty("netAssetsCents");
  });

  it("shows nothing to an investor with no positions", async () => {
    const view = await server.investorPerformanceView("nobody");
    expect(view.investments).toEqual([]);
  });

  it("only Harmonious decides what investors can see", async () => {
    await expect(
      server.setPerformanceVisibility(MANAGER_A, RUN_A_PUBLISHED, { investorVisible: true }),
    ).rejects.toThrow(/Harmonious/);
    await server.setPerformanceVisibility(PUBLISHER, RUN_A_PUBLISHED, { investorVisible: false });
    expect(updates("performance_runs")[0]!.payload.investor_visible).toBe(false);
  });
});

describe("methodology", () => {
  it("only Harmonious can change methodology", async () => {
    await expect(
      server.saveMethodology(MANAGER_A, {
        offeringId: FUND_A,
        label: "Manager methodology",
        fundType: "venture",
        effectiveFrom: "2026-01-01",
      }),
    ).rejects.toThrow(/Harmonious/);
  });

  it("adds a new version rather than editing the old one", async () => {
    await server.saveMethodology(PUBLISHER, {
      offeringId: FUND_A,
      label: "Venture v2",
      fundType: "venture",
      effectiveFrom: "2026-07-01",
    });
    const inserted = writes.find(
      (w) => w.table === "performance_methodologies" && w.op === "insert",
    );
    expect(inserted!.payload.version).toBe(2);
    const retired = writes.find(
      (w) => w.table === "performance_methodologies" && w.op === "update",
    );
    expect(retired!.payload.effective_to).toBeTruthy();
  });
});
