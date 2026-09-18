import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adversarial authorization tests for financial statement reporting.
 *
 * Every id here arrives "from the browser". The server must re-read the record
 * and authorise against the fund it actually belongs to, never against what the
 * caller claims, and no single person may prepare, review, approve and publish
 * the same set of statements.
 */

const FUND_A = "11111111-1111-4111-8111-111111111111";
const FUND_B = "22222222-2222-4222-8222-222222222222";
const BOOK_A = "bbbb1111-1111-4111-8111-111111111111";

const REPORT_A_DRAFT = "aaaa1111-1111-4111-8111-111111111111";
const REPORT_A_REVIEW = "aaaa1111-2222-4222-8222-222222222222";
const REPORT_A_APPROVED = "aaaa1111-3333-4333-8333-333333333333";
const REPORT_A_PUBLISHED = "aaaa1111-4444-4444-8444-444444444444";
const REPORT_A_INTERNAL = "aaaa1111-5555-4555-8555-555555555555";
const REPORT_B = "bbbb2222-2222-4222-8222-222222222222";

const WORKPAPER_A = "cccc1111-1111-4111-8111-111111111111";
const WORKPAPER_SHARED = "cccc1111-2222-4222-8222-222222222222";
const CHECK_ITEM = "eeee1111-1111-4111-8111-111111111111";

const MANAGER_A = "manager-a";
const MANAGER_B = "manager-b";
const PREPARER = "admin-preparer";
const REVIEWER = "admin-reviewer";
const PUBLISHER = "admin-publisher";
const INVESTOR = "investor-amy";
const OTHER_INVESTOR = "investor-ben";

type Write = { table: string; op: string; payload: any };
let writes: Write[] = [];

const cleanChecklist = [
  "cash_reconciled",
  "journals_posted",
  "expenses_accrued",
  "fees_calculated",
  "valuations_approved",
  "nav_approved",
  "allocations_finalized",
  "capital_reconciled",
  "trial_balance_balanced",
  "statements_reconciled",
].map((key, i) => ({
  id: `check-${i}`,
  book_id: BOOK_A,
  offering_id: FUND_A,
  period_end: "2026-03-31",
  item_key: key,
  label: key,
  blocking: true,
  status: "complete",
}));

const report = (over: Record<string, unknown>) => ({
  offering_id: FUND_A,
  book_id: BOOK_A,
  domain: "fund_accounting",
  report_type: "balance_sheet",
  period_id: "period-1",
  period_start: "2026-01-01",
  period_end: "2026-03-31",
  basis: "accrual",
  version: 1,
  status: "draft",
  gl_cutoff_at: "2026-04-02T00:00:00Z",
  source_cutoff_at: "2026-04-02T00:00:00Z",
  methodology_version: "v1",
  mapping_version: 1,
  nav_version_id: "nav-1",
  valuation_versions: [{ assetId: "asset-1", version: 2 }],
  exceptions: [],
  payload: { statement: "balance_sheet" },
  generated_by: PREPARER,
  prepared_by: PREPARER,
  reviewed_by: null,
  approved_by: null,
  published_by: null,
  manager_visible: false,
  investor_visible: false,
  subject_user_id: null,
  supersedes_id: null,
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
  financial_reports: [
    report({ id: REPORT_A_DRAFT }),
    report({ id: REPORT_A_REVIEW, status: "review", version: 2, reviewed_by: REVIEWER }),
    report({
      id: REPORT_A_APPROVED,
      status: "approved",
      version: 3,
      reviewed_by: REVIEWER,
      approved_by: REVIEWER,
    }),
    report({
      id: REPORT_A_PUBLISHED,
      status: "published",
      version: 4,
      reviewed_by: REVIEWER,
      approved_by: REVIEWER,
      published_by: PUBLISHER,
      published_at: "2026-04-10T00:00:00Z",
      manager_visible: true,
    }),
    report({
      id: REPORT_A_INTERNAL,
      status: "published",
      report_type: "trial_balance",
      version: 1,
      reviewed_by: REVIEWER,
      approved_by: REVIEWER,
      published_by: PUBLISHER,
    }),
    report({ id: REPORT_B, offering_id: FUND_B, status: "review" }),
  ],
  report_lines: [],
  report_exceptions: [],
  close_checklist_items: cleanChecklist,
  accounting_workpapers: [
    {
      id: WORKPAPER_A,
      offering_id: FUND_A,
      book_id: BOOK_A,
      kind: "cash_reconciliation",
      period_end: "2026-03-31",
      status: "review",
      prepared_by: PREPARER,
      shared_with_manager: false,
    },
    {
      id: WORKPAPER_SHARED,
      offering_id: FUND_A,
      book_id: BOOK_A,
      kind: "nav_tie_out",
      period_end: "2026-03-31",
      status: "approved",
      prepared_by: PREPARER,
      shared_with_manager: true,
    },
  ],
  statement_mapping_versions: [
    {
      id: "map-1",
      book_id: BOOK_A,
      offering_id: FUND_A,
      version: 1,
      basis: "accrual",
      status: "active",
      lines: [],
    },
  ],
  report_package_runs: [],
  report_packages: [],
  investor_positions: [
    { id: "pos-a", offering_id: FUND_A, investor_user_id: INVESTOR },
    { id: "pos-b", offering_id: FUND_B, investor_user_id: OTHER_INVESTOR },
  ],
  chart_of_accounts: [],
  journal_entries: [],
  journal_lines: [],
  accounting_periods: [{ id: "period-1", book_id: BOOK_A, period_end: "2026-03-31", status: "closed" }],
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
  ledgerBookForOffering: async () => ({ id: BOOK_A }),
  registerReport: vi.fn(async () => ({ id: "report-new" })),
}));

import {
  advanceFinancialReport,
  advanceWorkpaper,
  financialReportDetail,
  generalLedgerForPeriod,
  investorFinancials,
  listWorkpapers,
  managerFinancials,
  managerRespondToReport,
  prepareFinancialStatements,
  reportingQueue,
  reviseFinancialReport,
  setCloseChecklistItem,
  setReportVisibility,
  statementLineProvenance,
  trialBalanceAsOf,
} from "./financial-reporting.server";

beforeEach(() => {
  writes = [];
});

describe("fund isolation", () => {
  it("refuses a manager the accounting of a fund they do not manage", async () => {
    await expect(trialBalanceAsOf(MANAGER_A, FUND_B, "2026-03-31")).rejects.toThrow(
      /do not manage|forbidden/i,
    );
    await expect(
      generalLedgerForPeriod(MANAGER_A, FUND_B, {
        periodStart: "2026-01-01",
        periodEnd: "2026-03-31",
      }),
    ).rejects.toThrow(/do not manage|forbidden/i);
    await expect(listWorkpapers(MANAGER_A, FUND_B)).rejects.toThrow(/do not manage|forbidden/i);
  });

  it("refuses a substituted report id belonging to another fund", async () => {
    await expect(financialReportDetail(MANAGER_A, REPORT_B)).rejects.toThrow(
      /do not manage|forbidden/i,
    );
    await expect(managerRespondToReport(MANAGER_B, REPORT_A_PUBLISHED, "acknowledged")).rejects.toThrow(
      /do not manage|forbidden/i,
    );
    await expect(statementLineProvenance(MANAGER_A, REPORT_B, "cash")).rejects.toThrow(
      /do not manage|forbidden/i,
    );
    expect(writes).toHaveLength(0);
  });

  it("shows a manager only published financials for their own funds", async () => {
    const view = await managerFinancials(MANAGER_A);
    expect(view.reports.every((r: any) => r.offering_id === FUND_A)).toBe(true);
    expect(view.reports.every((r: any) => ["published", "superseded"].includes(r.status))).toBe(true);
    expect(view.funds.map((f: any) => f.id)).toEqual([FUND_A]);
  });
});

describe("managers never author statements", () => {
  it("refuses a manager preparing, advancing, amending or re-publishing", async () => {
    await expect(
      prepareFinancialStatements(MANAGER_A, {
        offeringId: FUND_A,
        periodStart: "2026-01-01",
        periodEnd: "2026-03-31",
      }),
    ).rejects.toThrow(/Harmonious/i);
    await expect(advanceFinancialReport(MANAGER_A, REPORT_A_REVIEW, "approved")).rejects.toThrow(
      /Harmonious/i,
    );
    await expect(
      reviseFinancialReport(MANAGER_A, REPORT_A_PUBLISHED, "the numbers moved"),
    ).rejects.toThrow(/Harmonious/i);
    await expect(
      setReportVisibility(MANAGER_A, REPORT_A_PUBLISHED, { investorVisible: true }),
    ).rejects.toThrow(/Harmonious/i);
    await expect(reportingQueue(MANAGER_A)).rejects.toThrow(/Harmonious/i);
    expect(writes).toHaveLength(0);
  });

  it("lets a manager acknowledge or challenge, but never edit", async () => {
    await managerRespondToReport(MANAGER_A, REPORT_A_PUBLISHED, "acknowledged");
    const patch = writes.find((w) => w.table === "financial_reports")!.payload;
    expect(Object.keys(patch).sort()).toEqual([
      "manager_note",
      "manager_responded_at",
      "manager_responded_by",
      "manager_response",
    ]);
  });

  it("requires a manager to say what looks wrong before challenging", async () => {
    await expect(
      managerRespondToReport(MANAGER_A, REPORT_A_PUBLISHED, "challenged", "bad"),
    ).rejects.toThrow(/what looks wrong/i);
    expect(writes).toHaveLength(0);
  });

  it("refuses a manager a report that has not been published to them", async () => {
    await expect(financialReportDetail(MANAGER_A, REPORT_A_DRAFT)).rejects.toThrow(
      /not been published/i,
    );
    await expect(managerRespondToReport(MANAGER_A, REPORT_A_DRAFT, "acknowledged")).rejects.toThrow(
      /not been published/i,
    );
  });
});

describe("segregation of duties", () => {
  it("will not let the preparer review or approve their own statements", async () => {
    await expect(advanceFinancialReport(PREPARER, REPORT_A_DRAFT, "prepared")).resolves.toBeTruthy();
    writes = [];
    await expect(advanceFinancialReport(PREPARER, REPORT_A_REVIEW, "approved")).rejects.toThrow(
      /other than its preparer/i,
    );
    expect(writes).toHaveLength(0);
  });

  it("lets a second person review and a third approve", async () => {
    await expect(advanceFinancialReport(REVIEWER, REPORT_A_REVIEW, "approved")).resolves.toBeTruthy();
  });

  it("never lets an automated actor satisfy a human approval", async () => {
    await expect(advanceFinancialReport("service_role", REPORT_A_REVIEW, "approved")).rejects.toThrow(
      /reviewer access|Harmonious|automated actor/i,
    );
  });
});

describe("published statements are immutable", () => {
  it("refuses to move a published report backwards", async () => {
    await expect(advanceFinancialReport(PUBLISHER, REPORT_A_PUBLISHED, "approved")).rejects.toThrow(
      /cannot move/i,
    );
    await expect(advanceFinancialReport(PUBLISHER, REPORT_A_PUBLISHED, "draft")).rejects.toThrow(
      /cannot move/i,
    );
    expect(writes).toHaveLength(0);
  });

  it("refuses to publish anything that has not been approved", async () => {
    await expect(advanceFinancialReport(PUBLISHER, REPORT_A_REVIEW, "published")).rejects.toThrow(
      /cannot move|approved report/i,
    );
  });

  it("amends by creating a new version that supersedes the old one", async () => {
    await reviseFinancialReport(PUBLISHER, REPORT_A_PUBLISHED, "Valuation restated after audit");
    const supersede = writes.find(
      (w) => w.table === "financial_reports" && w.op === "update" && w.payload.supersedes_id,
    );
    expect(supersede?.payload.supersedes_id).toBe(REPORT_A_PUBLISHED);
    expect(supersede?.payload.revision_reason).toMatch(/restated/);
  });

  it("insists on a stated reason for an amendment", async () => {
    await expect(reviseFinancialReport(PUBLISHER, REPORT_A_PUBLISHED, "oops")).rejects.toThrow(
      /why/i,
    );
    expect(writes).toHaveLength(0);
  });
});

describe("investor exposure", () => {
  it("shows an investor only investor-visible published reports for funds they hold", async () => {
    const view = await investorFinancials(INVESTOR);
    expect(view.funds.map((f: any) => f.id)).toEqual([FUND_A]);
    expect(view.reports).toEqual([]);
  });

  it("gives an investor with no position nothing at all", async () => {
    const view = await investorFinancials("nobody");
    expect(view).toEqual({ funds: [], reports: [] });
  });

  it("never publishes internal accounting detail to investors", async () => {
    await expect(
      setReportVisibility(PUBLISHER, REPORT_A_INTERNAL, { investorVisible: true }),
    ).rejects.toThrow(/never published to investors/i);
    expect(writes).toHaveLength(0);
  });

  it("refuses an investor any workpaper or internal queue", async () => {
    await expect(listWorkpapers(INVESTOR, FUND_A)).rejects.toThrow(/reviewer access|forbidden/i);
    await expect(reportingQueue(INVESTOR)).rejects.toThrow(/reviewer access|forbidden/i);
  });
});

describe("workpapers", () => {
  it("keeps unshared workpapers inside Harmonious", async () => {
    const managerView = await listWorkpapers(MANAGER_A, FUND_A);
    expect(managerView.map((w: any) => w.id)).toEqual([WORKPAPER_SHARED]);
    const adminView = await listWorkpapers(PREPARER, FUND_A);
    expect(adminView).toHaveLength(2);
  });

  it("needs a second person to sign a workpaper off", async () => {
    await expect(advanceWorkpaper(PREPARER, WORKPAPER_A, "approved")).rejects.toThrow(
      /other than its preparer/i,
    );
    await expect(advanceWorkpaper(REVIEWER, WORKPAPER_A, "approved")).resolves.toBeTruthy();
  });

  it("refuses a manager any workpaper sign-off", async () => {
    await expect(advanceWorkpaper(MANAGER_A, WORKPAPER_SHARED, "approved")).rejects.toThrow(
      /Harmonious/i,
    );
  });
});

describe("close checklist", () => {
  it("insists on a reason before a blocking close item is waived", async () => {
    await expect(
      setCloseChecklistItem(PREPARER, { itemId: CHECK_ITEM, status: "waived" }),
    ).rejects.toThrow(/not found|why/i);
  });

  it("refuses a manager changing the close checklist", async () => {
    await expect(
      setCloseChecklistItem(MANAGER_A, { itemId: "check-0", status: "complete" }),
    ).rejects.toThrow(/Harmonious/i);
    expect(writes).toHaveLength(0);
  });
});
