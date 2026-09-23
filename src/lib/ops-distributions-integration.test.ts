import { describe, expect, it, vi } from "vitest";

/**
 * Phase D inside Operations: Fund 360, Investor 360 and the work queue.
 *
 * These record pages and queues are readings of the authoritative distribution
 * records. The questions asked here are the adversarial ones: does one fund's
 * distribution reach another fund's page, do a person's investing profiles stay
 * apart, does a bank destination ever arrive unmasked, does a failed payment
 * survive, and does a queue item exist only while its own record says so.
 */

const FUND_A = "33333333-3333-4333-8333-333333333333";
const FUND_B = "44444444-4444-4444-8444-444444444444";
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const INVESTOR_1 = "55555555-5555-4555-8555-555555555555";
const INVESTOR_2 = "66666666-6666-4666-8666-666666666666";

const STAFF_ADMIN = "staff-admin";
const STAFF_EXEC = "staff-exec";
const OUTSIDER = "not-staff";

const FULL_ACCOUNT = "987654321000";

const tables: Record<string, any[]> = {
  user_roles: [
    { user_id: STAFF_ADMIN, role: "admin" },
    { user_id: STAFF_EXEC, role: "executive" },
    { user_id: OUTSIDER, role: "investor" },
  ],
  clients: [
    { id: CLIENT_A, name: "Client A" },
    { id: CLIENT_B, name: "Client B" },
  ],
  offerings: [
    { id: FUND_A, client_id: CLIENT_A, name: "Fund A", legal_entity_name: "Fund A LP", reg_type: "506b", fund_type: "spv", is_open: true, entity_type: "lp", state_formed: "DE" },
    { id: FUND_B, client_id: CLIENT_B, name: "Fund B", legal_entity_name: "Fund B LP", reg_type: "506b", fund_type: "spv", is_open: true, entity_type: "lp", state_formed: "DE" },
  ],
  profiles: [
    { user_id: INVESTOR_1, legal_name: "Investor One", email: "one@test.test" },
    { user_id: INVESTOR_2, legal_name: "Investor Two", email: "two@test.test" },
  ],
  investment_profiles: [
    { id: "prof-individual", owner_user_id: INVESTOR_1, display_label: "Investor One", legal_name: "Investor One", profile_type: "individual", status: "active", created_at: "2026-01-01T00:00:00Z" },
    { id: "prof-trust", owner_user_id: INVESTOR_1, display_label: "One Family Trust", legal_name: "One Family Trust", profile_type: "trust", status: "active", created_at: "2026-01-01T00:00:00Z" },
  ],
  capital_calls: [],
  expected_fundings: [],
  capital_accounts: [],
  capital_call_lines: [],
  bank_accounts: [],
  bank_transactions: [],
  k1_forms: [],
  fund_tax_documents: [],

  distribution_batches: [
    {
      id: "batch-a",
      offering_id: FUND_A,
      batch_number: 5,
      version: 1,
      title: "Distribution #5 — Q3 2026",
      distribution_type: "return_of_capital",
      status: "final_approval",
      payment_status: "not_started",
      balances: true,
      recipient_count: 2,
      record_date: "2026-09-01",
      payment_date: "2026-09-30",
      total_gross_cents: 300_00,
      total_withholding_cents: 30_00,
      total_fee_cents: 0,
      total_net_cents: 270_00,
      prepared_by: STAFF_ADMIN,
      updated_at: "2026-09-02T00:00:00Z",
    },
    {
      id: "batch-b",
      offering_id: FUND_B,
      batch_number: 1,
      version: 1,
      title: "Fund B distribution",
      distribution_type: "ordinary",
      status: "harmonious_review",
      payment_status: "not_started",
      balances: false,
      recipient_count: 1,
      record_date: "2026-09-01",
      payment_date: "2026-09-30",
      total_gross_cents: 100_00,
      total_withholding_cents: 0,
      total_fee_cents: 0,
      total_net_cents: 99_99,
      prepared_by: STAFF_ADMIN,
      updated_at: "2026-09-02T00:00:00Z",
    },
  ],
  distribution_lines: [
    {
      id: "line-1",
      batch_id: "batch-a",
      offering_id: FUND_A,
      investor_user_id: INVESTOR_1,
      investment_profile_id: "prof-individual",
      display_name: "Investor One",
      distribution_type: "return_of_capital",
      gross_cents: 200_00,
      withholding_cents: 20_00,
      fee_cents: 0,
      net_cents: 180_00,
      currency: "USD",
      payment_method: "wire",
      destination_verified: true,
      approval_state: "approved",
      payment_state: "confirmed",
      reconciliation_state: "reconciled",
      accounting_state: "not_started",
      hold_state: "clear",
      effective_date: "2026-09-30",
      updated_at: "2026-09-30T00:00:00Z",
    },
    {
      id: "line-2",
      batch_id: "batch-a",
      offering_id: FUND_A,
      investor_user_id: INVESTOR_1,
      investment_profile_id: "prof-trust",
      display_name: "One Family Trust",
      distribution_type: "return_of_capital",
      gross_cents: 100_00,
      withholding_cents: 10_00,
      fee_cents: 0,
      net_cents: 90_00,
      currency: "USD",
      payment_method: "wire",
      destination_verified: true,
      approval_state: "approved",
      payment_state: "not_started",
      reconciliation_state: "not_started",
      accounting_state: "not_started",
      hold_state: "clear",
      effective_date: "2026-09-30",
      updated_at: "2026-09-30T00:00:00Z",
    },
    {
      id: "line-3",
      batch_id: "batch-b",
      offering_id: FUND_B,
      investor_user_id: INVESTOR_2,
      investment_profile_id: null,
      display_name: "Investor Two",
      distribution_type: "ordinary",
      gross_cents: 100_00,
      withholding_cents: 0,
      fee_cents: 0,
      net_cents: 100_00,
      currency: "USD",
      payment_method: "ach",
      destination_verified: false,
      approval_state: "draft",
      payment_state: "not_started",
      reconciliation_state: "not_started",
      accounting_state: "not_started",
      hold_state: "clear",
      effective_date: "2026-09-30",
      updated_at: "2026-09-30T00:00:00Z",
    },
  ],
  distribution_withholdings: [
    {
      id: "wh-1",
      distribution_line_id: "line-1",
      offering_id: FUND_A,
      withholding_type: "federal",
      jurisdiction: "US",
      basis_cents: 200_00,
      rate_bps: 1000,
      amount_cents: 20_00,
      documentation_form: "w9",
      determination_reason: "Form W-9 on file",
    },
    {
      id: "wh-2",
      distribution_line_id: "line-2",
      offering_id: FUND_A,
      withholding_type: "federal",
      jurisdiction: "US",
      basis_cents: 100_00,
      rate_bps: 1000,
      amount_cents: 10_00,
      documentation_form: "w9",
      determination_reason: "Form W-9 on file",
    },
  ],
  investor_payment_instructions: [
    {
      id: "inst-1",
      investor_user_id: INVESTOR_1,
      investment_profile_id: "prof-individual",
      offering_id: FUND_A,
      version: 2,
      method: "wire",
      status: "approved",
      verification_status: "verified",
      masked_account: FULL_ACCOUNT,
      secured_details: { account_number: FULL_ACCOUNT, routing_number: "021000021" },
      cooling_off_until: null,
      effective_date: "2026-08-01",
    },
  ],
  payment_instruction_changes: [
    {
      id: "chg-1",
      offering_id: FUND_A,
      investor_user_id: INVESTOR_1,
      status: "pending_verification",
      change_kind: "destination_change",
      cooling_off_until: "2099-01-01T00:00:00Z",
      requested_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
  ],
  distribution_payments: [
    {
      id: "pay-1",
      distribution_line_id: "line-1",
      batch_id: "batch-a",
      offering_id: FUND_A,
      attempt: 1,
      reissue_of_id: null,
      provider: "manual_bank",
      status: "returned",
      submitted_amount_cents: 180_00,
      submitted_currency: "USD",
      submitted_destination: { account_number: FULL_ACCOUNT },
      submitted_destination_masked: "••••1000",
      failure_reason: "Beneficiary account closed",
      submitted_at: "2026-09-30T00:00:00Z",
      confirmed_at: null,
      failed_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    },
    {
      id: "pay-2",
      distribution_line_id: "line-1",
      batch_id: "batch-a",
      offering_id: FUND_A,
      attempt: 2,
      reissue_of_id: "pay-1",
      provider: "manual_bank",
      status: "confirmed",
      submitted_amount_cents: 180_00,
      submitted_currency: "USD",
      submitted_destination: { account_number: FULL_ACCOUNT },
      submitted_destination_masked: "••••2000",
      failure_reason: null,
      submitted_at: "2026-10-02T00:00:00Z",
      confirmed_at: "2026-10-03T00:00:00Z",
      failed_at: null,
      updated_at: "2026-10-03T00:00:00Z",
    },
  ],
  distribution_exceptions: [
    {
      id: "dexc-1",
      offering_id: FUND_A,
      batch_id: "batch-a",
      distribution_line_id: "line-1",
      investor_user_id: INVESTOR_1,
      kind: "payment_returned",
      status: "open",
      detail: "Returned by the beneficiary bank",
      created_at: "2026-10-01T00:00:00Z",
    },
  ],

  // sources the other collectors read; empty here so the test stays about Phase D
  investor_onboardings: [],
  investor_onboarding_exceptions: [],
  compliance_holds: [],
  investor_applications: [],
  kyc_verifications: [],
  accreditation_records: [],
  ledger_books: [],
  bank_reconciliations: [],
  accounting_exceptions: [],
  journal_entries: [],
  accounting_periods: [],
  asset_valuations: [],
  nav_versions: [],
  allocation_runs: [],
  financial_reports: [],
  investor_documents: [],
  investor_positions: [],
  fund_setups: [],
  ai_action_log: [],
};

function builder(table: string) {
  let rows = [...(tables[table] ?? [])];
  const api: any = {
    select: () => api,
    order: () => api,
    limit: () => api,
    is: () => api,
    not: (col: string, op: string, val: string) => {
      if (op === "in") {
        const excluded = String(val).replace(/[()]/g, "").split(",");
        rows = rows.filter((r) => !excluded.includes(String(r[col])));
      }
      return api;
    },
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
    ilike: () => api,
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve: any) => resolve({ data: rows, error: null }),
  };
  return api;
}

const contextFor = (userId: string) => ({ userId, supabase: { from: (t: string) => builder(t) } });

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

const ops = await import("@/lib/ops-records.server");
const queue = await import("@/lib/ops-work-queue.server");

const admin = () => contextFor(STAFF_ADMIN);

describe("Fund 360 — Capital shows this fund's distributions only", () => {
  it("lists Fund A's batch and never Fund B's", async () => {
    const tab = (await ops.fundTab(admin(), { id: FUND_A, tab: "capital" })) as any;
    expect(tab.distributions.map((b: any) => b.id)).toEqual(["batch-a"]);
    expect(JSON.stringify(tab)).not.toContain("Fund B distribution");
  });

  it("reports gross, withholding and net exactly as the batch records them", async () => {
    const tab = (await ops.fundTab(admin(), { id: FUND_A, tab: "capital" })) as any;
    expect(tab.totals.distributedGrossCents).toBe(300_00);
    expect(tab.totals.distributedWithholdingCents).toBe(30_00);
    expect(tab.totals.distributedNetCents).toBe(270_00);
    expect(
      tab.totals.distributedGrossCents - tab.totals.distributedWithholdingCents,
    ).toBe(tab.totals.distributedNetCents);
  });
});

describe("Fund 360 — Banking keeps the failed payment and hides the bank detail", () => {
  it("keeps the returned attempt and its reissue as separate linked records", async () => {
    const tab = (await ops.fundTab(admin(), { id: FUND_A, tab: "banking" })) as any;
    const ids = tab.outboundPayments.map((p: any) => p.id);
    expect(ids).toContain("pay-1");
    expect(ids).toContain("pay-2");
    const returned = tab.outboundPayments.find((p: any) => p.id === "pay-1");
    const reissue = tab.outboundPayments.find((p: any) => p.id === "pay-2");
    expect(returned.status).toBe("returned");
    expect(returned.failureReason).toBe("Beneficiary account closed");
    expect(reissue.reissueOf).toBe("pay-1");
    expect(reissue.attempt).toBe(2);
  });

  it("never sends a full account number to the browser", async () => {
    const tab = (await ops.fundTab(admin(), { id: FUND_A, tab: "banking" })) as any;
    expect(JSON.stringify(tab)).not.toContain(FULL_ACCOUNT);
  });

  it("withholds the destination from staff who may only look", async () => {
    const tab = (await ops.fundTab(contextFor(STAFF_EXEC), { id: FUND_A, tab: "banking" })) as any;
    expect(tab.detailVisible).toBe(false);
    expect(tab.outboundPayments.every((p: any) => p.destination === null)).toBe(true);
  });
});

describe("Investor 360 — profiles stay apart and destinations stay masked", () => {
  it("keeps the individual and the trust as separate distribution lines", async () => {
    const tab = (await ops.investorTab(admin(), { id: INVESTOR_1, tab: "capital" })) as any;
    const profiles = tab.distributions.map((d: any) => d.investment_profile_id);
    expect(profiles).toContain("prof-individual");
    expect(profiles).toContain("prof-trust");
    expect(tab.distributions).toHaveLength(2);
    // no combined figure exists anywhere in the payload
    expect(JSON.stringify(tab)).not.toContain("30000");
  });

  it("shows another investor nothing of this one", async () => {
    const tab = (await ops.investorTab(admin(), { id: INVESTOR_2, tab: "capital" })) as any;
    expect(tab.distributions.every((d: any) => d.offering_id === FUND_B)).toBe(true);
    expect(JSON.stringify(tab)).not.toContain("One Family Trust");
  });

  it("masks the payment destination and never returns the stored bank values", async () => {
    const tab = (await ops.investorTab(admin(), { id: INVESTOR_1, tab: "capital" })) as any;
    expect(tab.paymentDestinations[0].destination).toBe("••••1000");
    expect(JSON.stringify(tab)).not.toContain(FULL_ACCOUNT);
    expect(JSON.stringify(tab)).not.toContain("021000021");
  });

  it("shows the withholding behind each line, and withholding plus net equals gross", async () => {
    const tab = (await ops.investorTab(admin(), { id: INVESTOR_1, tab: "tax" })) as any;
    expect(tab.withholding).toHaveLength(2);
    const capital = (await ops.investorTab(admin(), { id: INVESTOR_1, tab: "capital" })) as any;
    for (const line of capital.distributions) {
      expect(line.withholding_cents + line.fee_cents + line.net_cents).toBe(line.gross_cents);
    }
  });

  it("refuses the whole record to someone who is merely signed in", async () => {
    await expect(ops.investorTab(contextFor(OUTSIDER), { id: INVESTOR_1, tab: "capital" })).rejects.toThrow(
      /Harmonious team/,
    );
    await expect(ops.fundTab(contextFor(OUTSIDER), { id: FUND_A, tab: "banking" })).rejects.toThrow(
      /Harmonious team/,
    );
  });
});

describe("Operations Home reads the distribution records themselves", () => {
  it("queues the batch at the stage its own status names", async () => {
    const result = await queue.workQueue(admin());
    const item = result.items.find((i) => i.id === "distribution-batch:batch-a");
    expect(item?.workflowState).toBe("final_approval");
    expect(item?.requiredAction).toBe("approve");
    expect(item?.dueDate).toBe("2026-09-30");
    expect(item?.destination).toBe(`/ops/fund/${FUND_A}?tab=capital`);
  });

  it("blocks a batch that does not reconcile to the cent", async () => {
    const result = await queue.workQueue(admin());
    const item = result.items.find((i) => i.id === "distribution-batch:batch-b");
    expect(item?.blocked).toBe(true);
    expect(item?.blockReason).toBe("The batch does not reconcile");
    expect(item?.section).toBe("blocked");
  });

  it("raises the returned payment, the exception and the cooling-off destination change", async () => {
    const result = await queue.workQueue(admin());
    const ids = result.items.map((i) => i.id);
    expect(ids).toContain("distribution-payment:pay-1");
    expect(ids).toContain("distribution-exception:dexc-1");
    const change = result.items.find((i) => i.id === "payment-instruction-change:chg-1");
    expect(change?.blockReason).toBe("Cooling-off period");
  });

  it("asks for accounting on a paid, reconciled line that has not posted", async () => {
    const result = await queue.workQueue(admin());
    const item = result.items.find((i) => i.id === "distribution-settlement:line-1");
    expect(item?.area).toBe("accounting");
    expect(item?.reason).toMatch(/journal has not been posted/);
  });

  it("drops the item as soon as the record itself moves on", async () => {
    const line = tables["distribution_lines"]!.find((l) => l.id === "line-1");
    const original = line.accounting_state;
    line.accounting_state = "posted";
    const after = await queue.workQueue(admin());
    line.accounting_state = original;
    expect(after.items.some((i) => i.id === "distribution-settlement:line-1")).toBe(false);
  });

  it("hands view-only staff nothing to approve or execute", async () => {
    const result = await queue.workQueue(contextFor(STAFF_EXEC));
    expect(result.items.every((i) => i.requiredAction === "see")).toBe(true);
  });

  it("gives an outsider no distribution work at all", async () => {
    await expect(queue.workQueue(contextFor(OUTSIDER))).rejects.toThrow(/Harmonious team/);
  });

  it("never carries a bank number into a queue summary", async () => {
    const result = await queue.workQueue(admin());
    expect(JSON.stringify(result.items)).not.toContain(FULL_ACCOUNT);
  });
});
