import { describe, expect, it, vi } from "vitest";

/**
 * Adversarial tests for the Operations work queue.
 *
 * The queue is a reading of other people's workflow records, so the questions
 * are: can an outsider get any of it, does a capability actually withhold an
 * area, does a fund filter leak the other fund, does the queue move on its own
 * when the underlying record moves, and does a summary ever carry a bank
 * number, an identity document or a tax identifier.
 */

const FUND_A = "33333333-3333-4333-8333-333333333333";
const FUND_B = "44444444-4444-4444-8444-444444444444";
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const INVESTOR_1 = "55555555-5555-4555-8555-555555555555";

const STAFF_ADMIN = "staff-admin";
const STAFF_FINANCE = "staff-finance";
const STAFF_EXEC = "staff-exec";
const OUTSIDER = "not-staff";

const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
const past = "2020-01-01";

const tables: Record<string, any[]> = {
  user_roles: [
    { user_id: STAFF_ADMIN, role: "admin" },
    { user_id: STAFF_FINANCE, role: "finance" },
    { user_id: STAFF_EXEC, role: "executive" },
    { user_id: OUTSIDER, role: "investor" },
  ],
  clients: [
    { id: CLIENT_A, name: "Client A" },
    { id: CLIENT_B, name: "Client B" },
  ],
  offerings: [
    { id: FUND_A, name: "Fund A", client_id: CLIENT_A },
    { id: FUND_B, name: "Fund B", client_id: CLIENT_B },
  ],
  ledger_books: [{ id: "book-a", offering_id: FUND_A }],
  profiles: [{ user_id: INVESTOR_1, legal_name: "Investor One", email: "one@test.test" }],
  investor_onboardings: [
    {
      id: "ob-1",
      offering_id: FUND_A,
      investor_user_id: INVESTOR_1,
      investment_profile_id: "prof-1",
      stage: "harmonious_review",
      assigned_to: STAFF_ADMIN,
      updated_at: "2026-03-01T00:00:00Z",
    },
  ],
  investor_onboarding_exceptions: [],
  compliance_holds: [],
  investor_applications: [],
  kyc_verifications: [],
  accreditation_records: [],
  capital_calls: [
    {
      id: "call-a",
      offering_id: FUND_A,
      call_number: 1,
      status: "in_review",
      due_date: soon,
      updated_at: "2026-03-01T00:00:00Z",
    },
    {
      id: "call-b",
      offering_id: FUND_B,
      call_number: 1,
      status: "draft",
      due_date: past,
      updated_at: "2026-03-01T00:00:00Z",
    },
  ],
  expected_fundings: [],
  bank_reconciliations: [],
  accounting_exceptions: [
    {
      id: "exc-1",
      offering_id: FUND_A,
      kind: "unidentified_cash",
      status: "open",
      detail: "Account 123456789 received 5,000",
      opened_by: STAFF_FINANCE,
      opened_at: "2026-03-02T00:00:00Z",
    },
  ],
  journal_entries: [],
  accounting_periods: [],
  asset_valuations: [],
  nav_versions: [],
  allocation_runs: [],
  financial_reports: [],
  investor_documents: [],
  ai_action_log: [
    {
      id: "log-1",
      client_id: CLIENT_A,
      created_at: "2026-03-03T00:00:00Z",
      actor_role: "operations",
      feature: "capital",
      action: "capital_call_reviewed",
      summary: "Call 1 reviewed",
      actor_id: STAFF_ADMIN,
    },
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
    eq: (col: string, val: unknown) => {
      rows = rows.filter((r) => r[col] === val);
      return api;
    },
    neq: (col: string, val: unknown) => {
      rows = rows.filter((r) => r[col] !== val);
      return api;
    },
    in: (col: string, vals: unknown[]) => {
      rows = rows.filter((r) => vals.includes(r[col]));
      return api;
    },
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve: any) => resolve({ data: rows, error: null }),
  };
  return api;
}

const contextFor = (userId: string) => ({ userId, supabase: { from: (t: string) => builder(t) } });

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

const queue = await import("@/lib/ops-work-queue.server");

describe("who gets a queue at all", () => {
  it("gives an outsider nothing, not even an empty queue", async () => {
    await expect(queue.workQueue(contextFor(OUTSIDER))).rejects.toThrow(/Harmonious team/);
    await expect(queue.recentOperationsActivity(contextFor(OUTSIDER))).rejects.toThrow(
      /Harmonious team/,
    );
  });

  it("hands finance the accounting exception but no onboarding work", async () => {
    const result = await queue.workQueue(contextFor(STAFF_FINANCE));
    const areas = new Set(result.items.map((i) => i.area));
    expect(areas.has("accounting")).toBe(true);
    expect(areas.has("onboarding")).toBe(false);
  });

  it("hands view-only staff nothing to approve", async () => {
    const result = await queue.workQueue(contextFor(STAFF_EXEC));
    expect(result.items.every((i) => i.requiredAction === "see")).toBe(true);
    expect(result.items.some((i) => i.requiredAction === "approve")).toBe(false);
  });
});

describe("one fund never shows another", () => {
  it("returns only Fund A work when filtered to Fund A", async () => {
    const result = await queue.workQueue(contextFor(STAFF_ADMIN), { filters: { fundId: FUND_A } });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((i) => i.fundId === FUND_A)).toBe(true);
    expect(JSON.stringify(result.items)).not.toContain("Fund B");
  });

  it("returns nothing for a client with no work rather than someone else's", async () => {
    const result = await queue.workQueue(contextFor(STAFF_ADMIN), { filters: { clientId: CLIENT_B } });
    expect(result.items.every((i) => i.clientId === CLIENT_B)).toBe(true);
    expect(JSON.stringify(result.items)).not.toContain("Client A");
  });
});

describe("the queue only reads authoritative state", () => {
  it("moves the capital call out of the queue when the workflow moves on", async () => {
    const before = await queue.workQueue(contextFor(STAFF_ADMIN));
    expect(before.items.some((i) => i.id === "capital-call:call-a")).toBe(true);

    const call = tables["capital_calls"]![0];
    const original = call.status;
    call.status = "published";
    const after = await queue.workQueue(contextFor(STAFF_ADMIN));
    call.status = original;

    expect(after.items.some((i) => i.id === "capital-call:call-a")).toBe(false);
  });

  it("uses the workflow's own state word and its own due date", async () => {
    const result = await queue.workQueue(contextFor(STAFF_ADMIN));
    const call = result.items.find((i) => i.id === "capital-call:call-a");
    expect(call?.workflowState).toBe("in_review");
    expect(call?.dueDate).toBe(soon);
    expect(result.items.filter((i) => i.section === "due_soon").every((i) => Boolean(i.dueDate))).toBe(
      true,
    );
  });

  it("marks a passed deadline critical and a blocked exception with its reason", async () => {
    const result = await queue.workQueue(contextFor(STAFF_ADMIN));
    const overdue = result.items.find((i) => i.id === "capital-call:call-b");
    expect(overdue?.priority).toBe("critical");
    const exception = result.items.find((i) => i.id === "accounting-exception:exc-1");
    expect(exception?.blocked).toBe(true);
    expect(exception?.blockReason).toBe("unidentified cash");
    expect(exception?.section).toBe("blocked");
  });

  it("says the unbuilt areas are unbuilt instead of showing a clear zero", async () => {
    const result = await queue.workQueue(contextFor(STAFF_ADMIN));
    const areas = result.unconfigured.map((u) => u.area);
    expect(areas).toContain("tax");
    expect(areas).toContain("regulatory");
    expect(areas).toContain("distributions");
    expect(result.items.some((i) => i.area === "tax" || i.area === "regulatory")).toBe(false);
  });
});

describe("summaries carry no restricted detail", () => {
  it("never repeats an account number or identity detail from the source record", async () => {
    const result = await queue.workQueue(contextFor(STAFF_ADMIN));
    const text = JSON.stringify(result.items);
    expect(text).not.toContain("123456789");
    expect(text).not.toMatch(/\d{3}-\d{2}-\d{4}/);
  });

  it("keeps recent activity to the six sanitized fields", async () => {
    const result = await queue.recentOperationsActivity(contextFor(STAFF_ADMIN));
    expect(result.activity.length).toBeGreaterThan(0);
    for (const entry of result.activity) {
      expect(Object.keys(entry).sort()).toEqual(
        ["action", "actor", "at", "capacity", "detail", "resource"].sort(),
      );
    }
  });
});

describe("each item opens the record where the action belongs", () => {
  it("sends onboarding review to the investor and capital work to the fund", async () => {
    const result = await queue.workQueue(contextFor(STAFF_ADMIN));
    const onboarding = result.items.find((i) => i.id === "onboarding:ob-1");
    expect(onboarding?.destination).toBe(`/ops/investors/${INVESTOR_1}?tab=investments`);
    const call = result.items.find((i) => i.id === "capital-call:call-a");
    expect(call?.destination).toBe(`/ops/fund/${FUND_A}?tab=capital`);
    const exception = result.items.find((i) => i.id === "accounting-exception:exc-1");
    expect(exception?.destination).toBe(`/ops/fund/${FUND_A}?tab=accounting`);
  });

  it("counts assigned work separately from work a person may merely see", async () => {
    const all = await queue.workQueue(contextFor(STAFF_ADMIN));
    const mine = await queue.workQueue(contextFor(STAFF_ADMIN), { filters: { scope: "mine" } });
    expect(mine.items.every((i) => i.assignedTo === STAFF_ADMIN)).toBe(true);
    expect(mine.items.length).toBeLessThan(all.items.length);
  });
});
