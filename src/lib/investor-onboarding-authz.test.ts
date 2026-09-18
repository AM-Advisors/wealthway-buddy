import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adversarial tests for Fund Administration Phase B — investor onboarding.
 *
 * Every id below arrives "from the browser". The server must re-read the
 * record, resolve authority from authoritative records, keep one investor out
 * of another's investment, keep fund managers out of compliance material, and
 * never let anyone self-certify money or close an investment early.
 */

const FUND_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FUND_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FUND_X = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const INV1 = "investor-one";
const INV2 = "investor-two";
const MANAGER_A = "manager-a";
const MANAGER_B = "manager-b";
const STAFF = "harmonious-staff";
const SERVICE = "service-process";

const OB1 = "onboarding-1";
const OB1B = "onboarding-1b";
const OB2 = "onboarding-2";
const OB_CLOSED = "onboarding-closed";

const TXN = "txn-1";
const TXN_USED = "txn-used";

const onboarding = (over: Record<string, unknown>) => ({
  stage: "verification",
  funding_status: "not_started",
  requested_amount_cents: 5_000_00,
  accepted_amount_cents: null,
  funded_amount_cents: 0,
  closed_amount_cents: null,
  investment_profile_id: null,
  person_id: null,
  application_id: null,
  position_id: null,
  approved_to_fund_at: null,
  accepted_at: null,
  closed_at: null,
  questionnaire_version: null,
  questionnaire_responses: { secret: "investor answer" },
  document_template_version: null,
  executed_snapshot: null,
  invitation_id: null,
  created_at: "2026-03-01T00:00:00Z",
  ...over,
});

const tables: Record<string, any[]> = {
  user_roles: [
    { user_id: STAFF, role: "admin" },
    { user_id: MANAGER_A, role: "fund_manager" },
    { user_id: MANAGER_B, role: "fund_manager" },
  ],
  fund_managers: [
    { user_id: MANAGER_A, offering_id: FUND_A },
    { user_id: MANAGER_B, offering_id: FUND_B },
  ],
  offerings: [
    { id: FUND_A, slug: "fund-a", name: "Fund A", min_investment_cents: 100_000 },
    { id: FUND_B, slug: "fund-b", name: "Fund B", min_investment_cents: 100_000 },
    { id: FUND_X, slug: "fund-x", name: "Fund X", min_investment_cents: 100_000 },
  ],
  fund_setups: [
    { id: "setup-a", offering_id: FUND_A, launch_state: "launched", launched_at: "2026-02-01T00:00:00Z", structure: "spv" },
    { id: "setup-b", offering_id: FUND_B, launch_state: "launched", launched_at: "2026-02-01T00:00:00Z", structure: "spv" },
    { id: "setup-x", offering_id: FUND_X, launch_state: "not_ready", launched_at: null, structure: "spv" },
  ],
  offering_requirements: [],
  fund_eligibility_configs: [],
  fund_banking_setups: [
    { id: "bank-a", setup_id: "setup-a", status: "pending", investor_instructions_released: false, bank_name: "First Republic" },
  ],
  investment_profiles: [
    { id: "profile-1", owner_user_id: INV1, profile_type: "individual", display_label: "Investor One" },
    { id: "profile-2", owner_user_id: INV2, profile_type: "individual", display_label: "Investor Two" },
  ],
  investor_onboardings: [
    onboarding({ id: OB1, offering_id: FUND_A, investor_user_id: INV1, investment_profile_id: "profile-1" }),
    onboarding({
      id: OB1B,
      offering_id: FUND_A,
      investor_user_id: INV2,
      stage: "awaiting_funds",
      accepted_amount_cents: 250_000,
    }),
    onboarding({ id: OB2, offering_id: FUND_B, investor_user_id: INV2 }),
    onboarding({
      id: OB_CLOSED,
      offering_id: FUND_A,
      investor_user_id: INV1,
      stage: "closed",
      closed_at: "2026-03-02T00:00:00Z",
    }),
  ],
  investor_onboarding_exceptions: [],
  investor_onboarding_events: [{ id: "ev-used", event: "bank_transaction_matched", subject_id: TXN_USED }],
  bank_transactions: [
    { id: TXN, offering_id: FUND_A, amount_cents: 250_000, description: "wire", posted_on: "2026-03-05" },
    { id: TXN_USED, offering_id: FUND_A, amount_cents: 250_000, description: "wire", posted_on: "2026-03-05" },
  ],
  fund_invitations: [
    {
      id: "inv-expired",
      offering_id: FUND_A,
      token: "expired-token",
      status: "pending",
      expires_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "inv-other-fund",
      offering_id: FUND_B,
      token: "other-fund-token",
      status: "pending",
      expires_at: "2099-01-01T00:00:00Z",
    },
  ],
};

type Write = { table: string; op: string; payload: any };
let writes: Write[] = [];

function builder(table: string) {
  let rows = [...(tables[table] ?? [])];
  const api: any = {
    select: () => api,
    order: () => api,
    limit: () => api,
    is: () => api,
    not: () => api,
    or: (expr: string) => {
      const terms = expr.split(",").map((t) => t.split("."));
      rows = rows.filter((r) => terms.some(([col, , val]) => String(r[col!]) === val));
      return api;
    },
    neq: (col: string, val: unknown) => {
      rows = rows.filter((r) => r[col] !== val);
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
  supabaseAdmin: {
    from: (table: string) => builder(table),
    rpc: () => Promise.resolve({ data: [{ details: { account: "****1234" } }], error: null }),
  },
}));

const server = await import("@/lib/investor-onboarding.server");

beforeEach(() => {
  writes = [];
});

const updates = (table: string) => writes.filter((w) => w.table === table && w.op === "update");
const inserts = (table: string) => writes.filter((w) => w.table === table && w.op === "insert");

describe("investor isolation", () => {
  it("refuses one investor access to another investor's investment", async () => {
    await expect(server.onboardingDetail(INV2, OB1)).rejects.toThrow(/Forbidden/);
  });

  it("refuses an unknown service process entirely", async () => {
    await expect(server.onboardingDetail(SERVICE, OB1)).rejects.toThrow(/Forbidden/);
    await expect(server.onboardingDetail(null as any, OB1)).rejects.toThrow(/Forbidden/);
  });

  it("lets the real investor read their own investment", async () => {
    const detail = await server.onboardingDetail(INV1, OB1);
    expect(detail.id).toBe(OB1);
    expect(detail.actorRole).toBe("investor");
  });

  it("refuses a profile that belongs to somebody else", async () => {
    await expect(
      server.chooseProfile(INV1, { onboardingId: OB1, profileId: "profile-2" }),
    ).rejects.toThrow(/Forbidden/);
    expect(updates("investor_onboardings")).toHaveLength(0);
  });

  it("will not change an investment that has already closed", async () => {
    await expect(
      server.setInvestmentAmount(INV1, { onboardingId: OB_CLOSED, amountCents: 1_000_000 }),
    ).rejects.toThrow(/no longer be changed/);
  });
});

describe("fund manager limits", () => {
  it("refuses a manager access to an investment in a fund they do not manage", async () => {
    await expect(server.onboardingDetail(MANAGER_B, OB1)).rejects.toThrow(/Forbidden/);
    await expect(server.managerOnboardingBoard(MANAGER_B, FUND_A)).rejects.toThrow(/Forbidden/);
  });

  it("gives the managing manager progress only — never compliance material", async () => {
    const detail = await server.onboardingDetail(MANAGER_A, OB1);
    expect(detail.executedSnapshot ?? null).toBeNull();
    expect(detail.questionnaireResponses).toEqual({});
    expect(JSON.stringify(detail)).not.toContain("investor answer");
  });

  it("never gives a manager investor funding instructions", async () => {
    await expect(server.fundingInstructions(MANAGER_A, OB1)).rejects.toThrow(/Forbidden/);
  });

  it("refuses a manager invitation into another manager's fund", async () => {
    await expect(
      server.inviteInvestor(MANAGER_B, { offeringId: FUND_A, email: "x@example.com" }),
    ).rejects.toThrow(/Forbidden/);
    expect(inserts("fund_invitations")).toHaveLength(0);
  });
});

describe("Harmonious-only controls", () => {
  it("refuses approval, bank application, acceptance and closing from non-staff", async () => {
    await expect(server.approveToFund(MANAGER_A, { onboardingId: OB1 })).rejects.toThrow(/Forbidden/);
    await expect(server.applyBankActivity(INV1, { bankTransactionId: TXN })).rejects.toThrow(/Forbidden/);
    await expect(
      server.acceptSubscription(INV1, { onboardingId: OB1, signerName: "Me", capacity: "self" }),
    ).rejects.toThrow(/Forbidden/);
    await expect(server.closeInvestment(MANAGER_A, { onboardingId: OB1 })).rejects.toThrow(/Forbidden/);
    expect(writes.filter((w) => w.table === "investor_positions")).toHaveLength(0);
  });

  it("will not approve an investment whose requirements are unfinished", async () => {
    await expect(server.approveToFund(STAFF, { onboardingId: OB1 })).rejects.toThrow();
    expect(updates("investor_onboardings")).toHaveLength(0);
  });

  it("will not close an investment that is not funded and accepted", async () => {
    await expect(server.closeInvestment(STAFF, { onboardingId: OB1 })).rejects.toThrow();
    expect(inserts("commitment_events")).toHaveLength(0);
  });
});

describe("funding truth", () => {
  it("does not treat an investor saying they sent funds as money received", async () => {
    await server.investorReportsFundsSent(INV2, OB1B).catch(() => undefined);
    const patches = updates("investor_onboardings").map((w) => w.payload);
    for (const patch of patches) {
      expect(patch.funding_status).not.toBe("funded");
      expect(patch.stage).not.toBe("closed");
      expect(patch.funded_amount_cents).toBeUndefined();
    }
  });

  it("keeps funding instructions locked until banking has been released", async () => {
    const result = await server.fundingInstructions(INV1, OB1);
    expect(result.unlocked).toBe(false);
    expect(result.instructions).toBeNull();
  });

  it("refuses a bank transaction that was already applied", async () => {
    await expect(
      server.applyBankActivity(STAFF, { bankTransactionId: TXN_USED, onboardingId: OB1B }),
    ).rejects.toThrow(/already been applied/);
  });

  it("raises an exception rather than guessing between equal amounts", async () => {
    tables['investor_onboardings']!.push(
      onboarding({
        id: "onboarding-twin",
        offering_id: FUND_A,
        investor_user_id: "investor-three",
        stage: "awaiting_funds",
        accepted_amount_cents: 250_000,
      }),
    );
    const result = await server.applyBankActivity(STAFF, { bankTransactionId: TXN });
    tables['investor_onboardings']!.pop();
    expect(result.matched).toBe(false);
    expect(updates("investor_onboardings")).toHaveLength(0);
  });
});

describe("invitations and launch gate", () => {
  it("will not start onboarding on a fund that has not been launched", async () => {
    await expect(server.startOnboarding(INV1, { slugOrId: FUND_X })).rejects.toThrow(/not open/);
  });

  it("rejects an expired invitation", async () => {
    await expect(
      server.startOnboarding(INV1, { slugOrId: FUND_A, invitationToken: "expired-token" }),
    ).rejects.toThrow();
    expect(inserts("investor_onboardings")).toHaveLength(0);
  });

  it("rejects an invitation issued for a different fund", async () => {
    await expect(
      server.startOnboarding(INV1, { slugOrId: FUND_A, invitationToken: "other-fund-token" }),
    ).rejects.toThrow(/different fund/);
  });
});
