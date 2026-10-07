import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Permanent financial regression tests for the four controls Run 3 proved
 * operationally (allocation independent review lives in allocation-authz.test.ts):
 *
 *   B. payout bank-detail prerequisite
 *   C. payout posting segregation + atomicity
 *   D. distribution review separation
 *
 * Every id arrives "from the browser"; the server re-reads the record and the
 * caller's roles. Writes are captured so a refusal can be proven to change nothing.
 */

const FUND = "77777777-7777-4777-8777-777777777777";
const PREPARER = "staff-preparer";
const REVIEWER = "staff-reviewer";
const SECOND_REVIEWER = "staff-reviewer-2";
const APPROVER = "staff-approver";
const POSTER = "staff-poster";
const OPS_ONLY = "staff-operations-only";
const MANAGER = "fund-manager";
const INVESTOR = "investor-1";

type Write = { table: string; op: string; payload: any };
let writes: Write[] = [];
let rpcCalls: { fn: string; args: any }[] = [];
let rpcResult: { data: any; error: any } = { data: { commitmentEventId: "ce-1" }, error: null };
let tables: Record<string, any[]> = {};

const batch = (over: Record<string, unknown>) => ({
  offering_id: FUND,
  status: "proposed",
  distribution_kind: "cash",
  balances: true,
  prepared_by: PREPARER,
  prepared_at: "2026-09-01T00:00:00Z",
  requested_by: null,
  reviewed_by: null,
  manager_approved_by: null,
  final_approved_by: null,
  ...over,
});

const payment = (over: Record<string, unknown>) => ({
  offering_id: FUND,
  batch_id: "batch-proposed",
  distribution_line_id: "line-1",
  reconciliation_id: "rec-1",
  journal_entry_id: "je-1",
  sent_on: "2026-09-15",
  posted_at: null,
  submitted_by: APPROVER,
  submitted_at: "2026-09-15T00:00:00Z",
  reconciled_by: REVIEWER,
  reconciliation_approved_by: SECOND_REVIEWER,
  submitted_amount_cents: 100_00,
  approval_chain: [],
  ...over,
});

function seed() {
  tables = {
    user_roles: [
      { user_id: PREPARER, role: "finance" },
      { user_id: REVIEWER, role: "finance" },
      { user_id: SECOND_REVIEWER, role: "finance" },
      { user_id: APPROVER, role: "finance" },
      { user_id: POSTER, role: "finance" },
      { user_id: OPS_ONLY, role: "operations" },
      { user_id: MANAGER, role: "fund_manager" },
      { user_id: INVESTOR, role: "investor" },
    ],
    fund_managers: [{ user_id: MANAGER, offering_id: FUND }],
    distribution_batches: [
      batch({ id: "batch-proposed" }),
      batch({ id: "batch-reviewed", status: "harmonious_review", reviewed_by: REVIEWER, reviewed_at: "2026-09-02T00:00:00Z" }),
      batch({ id: "batch-unbalanced", balances: false }),
    ],
    distribution_lines: [
      { id: "line-1", batch_id: "batch-proposed", offering_id: FUND, investor_user_id: INVESTOR, net_cents: 100_00, gross_cents: 100_00, distribution_type: "ordinary", position_id: "pos-1" },
    ],
    investor_payment_instructions: [],
    distribution_payments: [
      payment({ id: "pay-draft-journal", journal_entry_id: "je-draft" }),
      payment({ id: "pay-reviewed-by-poster", journal_entry_id: "je-reviewed" }),
      payment({ id: "pay-approved-by-poster", journal_entry_id: "je-approved-by-poster" }),
      payment({ id: "pay-ready", journal_entry_id: "je-approved" }),
      payment({ id: "pay-unapproved-rec", journal_entry_id: "je-approved", reconciliation_approved_by: null }),
      payment({ id: "pay-sent-by-poster", journal_entry_id: "je-approved", submitted_by: POSTER }),
    ],
    journal_entries: [
      { id: "je-draft", status: "draft", reviewed_by: null, approved_by: null },
      { id: "je-reviewed", status: "reviewed", reviewed_by: POSTER, approved_by: null },
      { id: "je-approved-by-poster", status: "approved", reviewed_by: REVIEWER, approved_by: POSTER },
      { id: "je-approved", status: "approved", reviewed_by: REVIEWER, approved_by: APPROVER },
    ],
    ledger_books: [],
  };
}

function builder(table: string) {
  let rows = [...(tables[table] ?? [])];
  const api: any = {
    select: () => api,
    order: () => api,
    limit: () => api,
    is: (col: string, val: unknown) => {
      rows = rows.filter((r) => (r[col] ?? null) === val);
      return api;
    },
    not: () => api,
    neq: () => api,
    lte: () => api,
    gte: () => api,
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
    then: (resolve: any) => resolve({ data: rows, error: null }),
    insert: (payload: any) => {
      writes.push({ table, op: "insert", payload });
      const created = { id: `new-${table}`, ...payload };
      return {
        select: () => ({
          single: () => Promise.resolve({ data: created, error: null }),
          maybeSingle: () => Promise.resolve({ data: created, error: null }),
        }),
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
  supabaseAdmin: {
    from: (table: string) => builder(table),
    rpc: (fn: string, args: any) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(rpcResult);
    },
  },
}));

const advanceReconciliationJournal = vi.fn(async () => ({}));
vi.mock("@/lib/reconciliation.server", () => ({
  advanceReconciliationJournal: (...a: any[]) => (advanceReconciliationJournal as any)(...a),
  prepareReconciliationJournal: vi.fn(),
  reverseAndCorrectReconciliation: vi.fn(),
}));
vi.mock("@/lib/accounting.server", () => ({ ledgerBookForOffering: vi.fn(async () => null), registerReport: vi.fn() }));
vi.mock("@/lib/compliance-holds.functions", () => ({ assertNoHold: vi.fn(async () => undefined) }));
// No self-approval exception in these tests: every waiver request is refused.
vi.mock("@/lib/self-approval.server", () => ({ selfApprove: vi.fn(async () => false) }));

import {
  investorConfirmDistribution,
  managerApproveDistribution,
  postDistributionPayment,
  reviewDistribution,
} from "./distributions.server";
import { batchTransitionError, executionBlockers, payoutDestinationBlockers } from "./distributions-model";

const MONEY_TABLES = ["journal_entries", "distribution_payments", "commitment_events", "fund_distributions", "distribution_lines", "distribution_batches", "bank_reconciliations"];
const moneyWrites = () => writes.filter((w) => MONEY_TABLES.includes(w.table));

beforeEach(() => {
  seed();
  writes = [];
  rpcCalls = [];
  rpcResult = { data: { commitmentEventId: "ce-1" }, error: null };
  advanceReconciliationJournal.mockClear();
});

// ------------------------------------------------------------------ B
describe("REGRESSION B - payout bank-detail prerequisite", () => {
  it("blocks final approval for any cash payee without a bound, verified destination", () => {
    const lines = [
      { id: "a", net_cents: 100, payment_instruction_id: null, destination_verified: false },
      { id: "b", net_cents: 100, payment_instruction_id: "pi-1", destination_verified: false },
      { id: "c", net_cents: 100, payment_instruction_id: "pi-2", destination_verified: true },
      { id: "d", net_cents: 0, payment_instruction_id: null, destination_verified: false },
    ];
    expect(payoutDestinationBlockers("cash", lines).map((l) => l.id)).toEqual(["a", "b"]);
    expect(payoutDestinationBlockers("cash_and_shares", lines).map((l) => l.id)).toEqual(["a", "b"]);
    expect(payoutDestinationBlockers("shares", lines)).toEqual([]);
  });

  it("final approval runs the destination check before the batch can become approved (and frozen)", () => {
    const server = readFileSync("src/lib/distributions.server.ts", "utf8");
    const fn = server.slice(server.indexOf("export async function finalApproveDistribution"));
    const body = fn.slice(0, fn.indexOf("\nexport async function"));
    const check = body.indexOf("payoutDestinationBlockers(");
    const approve = body.indexOf('status: "approved"');
    expect(check).toBeGreaterThan(0);
    expect(approve).toBeGreaterThan(check);
    expect(body.slice(check, approve)).toMatch(/PAYMENT DESTINATION REQUIRED/);
  });

  it("an executable payment refuses an unapproved or unverified destination", () => {
    const base = {
      economicAllocationApproved: true, batchBalances: true, batchStatus: "approved", managerApprovalRequired: false,
      managerApprovedBy: null, finalApprovedBy: "x", investorConfirmationRequired: false, investorConfirmedAt: null,
      destinationStatus: "approved", destinationVerified: true, destinationCoolingOffUntil: null,
      withholdingCalculated: true, availableCashCents: 1_000, netPaymentCents: 100, activeHolds: [], nowIso: "2026-09-15T00:00:00Z",
    } as any;
    expect(executionBlockers(base)).toEqual([]);
    expect(executionBlockers({ ...base, destinationVerified: false })).toContain("The payment destination has not been verified.");
    expect(executionBlockers({ ...base, destinationStatus: "pending_review" })).toContain("The payment destination is not an approved version.");
  });

  it("rejects binding an unverified destination to a payout line", async () => {
    tables['investor_payment_instructions'] = [
      { id: "pi-1", version: 1, method: "wire", status: "approved", verification_status: "pending", investor_user_id: INVESTOR, offering_id: FUND, revoked_at: null, superseded_at: null },
    ];
    await expect(investorConfirmDistribution(INVESTOR, "line-1")).rejects.toThrow(/not been verified/i);
    expect(writes.filter((w) => w.table === "distribution_lines")).toHaveLength(0);
  });

  it("binds a verified destination, and refuses changes once the distribution is approved", async () => {
    tables['investor_payment_instructions'] = [
      { id: "pi-1", version: 3, method: "wire", status: "approved", verification_status: "verified", investor_user_id: INVESTOR, offering_id: FUND, revoked_at: null, superseded_at: null },
    ];
    await investorConfirmDistribution(INVESTOR, "line-1");
    const bound = writes.find((w) => w.table === "distribution_lines" && w.op === "update");
    expect(bound?.payload).toMatchObject({ payment_instruction_id: "pi-1", payment_instruction_version: 3, destination_verified: true });

    writes = [];
    tables['distribution_batches']![0].status = "approved";
    await expect(investorConfirmDistribution(INVESTOR, "line-1")).rejects.toThrow(/already approved/i);
    expect(writes).toHaveLength(0);
  });
});

// ------------------------------------------------------------------ C
describe("REGRESSION C - payout posting segregation and atomicity", () => {
  it("a draft journal is only reviewed and approved by the first caller; it is never posted by them", async () => {
    const result = await postDistributionPayment(PREPARER, "pay-draft-journal");
    expect(result).toMatchObject({ posted: false });
    expect(advanceReconciliationJournal.mock.calls.map((c: any[]) => c[2])).toEqual(["reviewed", "approved"]);
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses the journal reviewer also approving it", async () => {
    await expect(postDistributionPayment(POSTER, "pay-reviewed-by-poster")).rejects.toThrow(/reviewed the payment journal cannot also approve/i);
    expect(advanceReconciliationJournal).not.toHaveBeenCalled();
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses the journal approver also posting it", async () => {
    await expect(postDistributionPayment(POSTER, "pay-approved-by-poster")).rejects.toThrow(/approved the payment journal cannot also post/i);
    expect(rpcCalls).toHaveLength(0);
    expect(moneyWrites()).toHaveLength(0);
  });

  it("refuses posting before a second person approves the reconciliation", async () => {
    await expect(postDistributionPayment(POSTER, "pay-unapproved-rec")).rejects.toThrow(/approved by a second person/i);
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses the person who recorded the payment as sent also posting it", async () => {
    await expect(postDistributionPayment(POSTER, "pay-sent-by-poster")).rejects.toThrow(/recorded the payment as sent cannot post/i);
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses posting by staff without accounting approval capability", async () => {
    await expect(postDistributionPayment(OPS_ONLY, "pay-ready")).rejects.toThrow(/capability|Forbidden/i);
    await expect(postDistributionPayment(MANAGER, "pay-ready")).rejects.toThrow(/Forbidden/i);
    expect(rpcCalls).toHaveLength(0);
  });

  it("a distinct poster posts through one atomic database call; the server writes no money state itself", async () => {
    const result = await postDistributionPayment(POSTER, "pay-ready");
    expect(result).toMatchObject({ posted: true, commitmentEventId: "ce-1" });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({ fn: "post_distribution_payment_atomic", args: { _payment_id: "pay-ready", _actor: POSTER } });
    expect(moneyWrites()).toHaveLength(0);
    expect(writes.filter((w) => w.table === "distribution_events").map((w) => w.payload.event)).toEqual(["distribution_posted"]);
  });

  it("if posting fails midway nothing is half-posted: no journal, payment, capital or projection writes and no posted event", async () => {
    rpcResult = { data: null, error: { message: "simulated failure inserting fund_distributions" } };
    await expect(postDistributionPayment(POSTER, "pay-ready")).rejects.toThrow(/nothing was changed/i);
    expect(moneyWrites()).toHaveLength(0);
    expect(writes.filter((w) => w.table === "distribution_events")).toHaveLength(0);
  });

  it("the atomic posting function is a single transaction callable only by the server", () => {
    const sql = readFileSync("drizzle/migrations/0190_atomic_distribution_payment_posting.sql", "utf8");
    expect(sql).toMatch(/LANGUAGE plpgsql/);
    // One function body: every effect commits together or the RAISE rolls all of them back.
    for (const effect of [
      /UPDATE journal_entries SET status = 'posted'/,
      /INSERT INTO commitment_events/,
      /UPDATE distribution_payments SET posted_at/,
      /UPDATE distribution_payments SET settled_at/,
      /INSERT INTO fund_distributions/,
      /UPDATE distribution_lines SET accounting_state = 'posted'/,
    ]) expect(sql).toMatch(effect);
    expect(sql).toMatch(/j\.approved_by = _actor THEN RAISE EXCEPTION/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.post_distribution_payment_atomic[^;]+FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.post_distribution_payment_atomic[^;]+TO service_role/);
  });
});

// ------------------------------------------------------------------ D
describe("REGRESSION D - distribution review separation", () => {
  it("refuses the preparer reviewing their own distribution", async () => {
    await expect(reviewDistribution(PREPARER, "batch-proposed")).rejects.toThrow(/prepared or requested this distribution cannot review/i);
    expect(writes).toHaveLength(0);
  });

  it("refuses review by someone without review authority", async () => {
    await expect(reviewDistribution(OPS_ONLY, "batch-proposed")).rejects.toThrow(/capability|Forbidden/i);
    await expect(reviewDistribution(MANAGER, "batch-proposed")).rejects.toThrow(/Forbidden|cannot/i);
    expect(writes).toHaveLength(0);
  });

  it("refuses a later reviewer overwriting the recorded reviewer", async () => {
    await expect(reviewDistribution(SECOND_REVIEWER, "batch-reviewed")).rejects.toThrow(/already been reviewed/i);
    expect(writes).toHaveLength(0);
  });

  it("refuses review of a distribution that does not balance", async () => {
    await expect(reviewDistribution(REVIEWER, "batch-unbalanced")).rejects.toThrow(/does not balance/i);
  });

  it("records the reviewer once and preserves the action in the append-only audit history", async () => {
    await reviewDistribution(REVIEWER, "batch-proposed");
    const update = writes.find((w) => w.table === "distribution_batches" && w.op === "update");
    expect(update?.payload).toMatchObject({ status: "harmonious_review", reviewed_by: REVIEWER });
    const event = writes.find((w) => w.table === "distribution_events");
    expect(event).toMatchObject({ op: "insert", payload: { event: "distribution_reviewed", actor_user_id: REVIEWER, from_status: "proposed", to_status: "harmonious_review" } });
    expect(writes.some((w) => w.table === "distribution_events" && w.op !== "insert")).toBe(false);
  });

  it("required review cannot be bypassed by manager or final approval", async () => {
    await expect(managerApproveDistribution(MANAGER, "batch-proposed")).rejects.toThrow(/not waiting on manager approval/i);
    expect(writes).toHaveLength(0);
    expect(batchTransitionError("proposed", "final_approval")).toBeTruthy();
    expect(batchTransitionError("proposed", "approved")).toBeTruthy();
    expect(batchTransitionError("proposed", "manager_approval")).toBeTruthy();
  });
});
