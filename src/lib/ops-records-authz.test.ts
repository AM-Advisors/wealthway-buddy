import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adversarial tests for the four Operations record pages.
 *
 * Every identifier below arrives "from the browser". Reaching a record from
 * another record grants nothing: the server re-checks the staff capability and
 * re-reads the record, one client never shows another's funds, one fund never
 * shows another's investors, a person's investing profiles stay separate, and
 * bank detail needs more than permission to open the fund.
 */

const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const FUND_A = "33333333-3333-4333-8333-333333333333";
const FUND_B = "44444444-4444-4444-8444-444444444444";
const INVESTOR_1 = "55555555-5555-4555-8555-555555555555";
const INVESTOR_2 = "66666666-6666-4666-8666-666666666666";
const COMPANY_A = "77777777-7777-4777-8777-777777777777";
const UNKNOWN = "99999999-9999-4999-8999-999999999999";

const STAFF_ADMIN = "staff-admin";
const STAFF_EXEC = "staff-exec";
const STAFF_SUCCESS = "staff-success";
const OUTSIDER = "not-staff";

const tables: Record<string, any[]> = {
  user_roles: [
    { user_id: STAFF_ADMIN, role: "admin" },
    { user_id: STAFF_EXEC, role: "executive" },
    { user_id: STAFF_SUCCESS, role: "client_success" },
    { user_id: OUTSIDER, role: "investor" },
  ],
  clients: [
    { id: CLIENT_A, name: "Client A", legal_name: "Client A LLC", status: "active", primary_contact_name: "Ann", primary_contact_email: "ann@a.test", created_at: "2026-01-01T00:00:00Z" },
    { id: CLIENT_B, name: "Client B", legal_name: "Client B LLC", status: "active", primary_contact_name: "Bob", primary_contact_email: "bob@b.test", created_at: "2026-01-01T00:00:00Z" },
  ],
  client_entities: [{ id: "ent-a", client_id: CLIENT_A, legal_name: "A Holdings", entity_type: "llc", status: "active", jurisdiction: "DE" }],
  client_users: [{ client_id: CLIENT_A, user_id: INVESTOR_1, client_role: "gp", can_approve: true }],
  client_engagements: [],
  offerings: [
    { id: FUND_A, client_id: CLIENT_A, name: "Fund A", legal_entity_name: "Fund A LP", reg_type: "506b", fund_type: "spv", is_open: true, entity_type: "lp", state_formed: "DE" },
    { id: FUND_B, client_id: CLIENT_B, name: "Fund B", legal_entity_name: "Fund B LP", reg_type: "506c", fund_type: "spv", is_open: true, entity_type: "lp", state_formed: "DE" },
  ],
  fund_setups: [
    { id: "setup-a", offering_id: FUND_A, stage: "operating", launch_state: "launched", investment_strategy: "growth", domicile: "DE", regulatory_structure: "506b" },
  ],
  investor_onboardings: [
    { id: "ob-1", offering_id: FUND_A, investor_user_id: INVESTOR_1, investment_profile_id: "prof-individual", stage: "funded", funding_status: "settled", requested_amount_cents: 100_00, accepted_amount_cents: 100_00, funded_amount_cents: 100_00, position_id: "pos-1" },
    { id: "ob-2", offering_id: FUND_A, investor_user_id: INVESTOR_1, investment_profile_id: "prof-trust", stage: "funded", funding_status: "settled", requested_amount_cents: 400_00, accepted_amount_cents: 400_00, funded_amount_cents: 250_00, position_id: "pos-2" },
    { id: "ob-3", offering_id: FUND_B, investor_user_id: INVESTOR_2, investment_profile_id: "prof-other", stage: "review", funding_status: "not_started", requested_amount_cents: 900_00, accepted_amount_cents: null, funded_amount_cents: 0, position_id: null },
  ],
  investor_positions: [
    { id: "pos-1", offering_id: FUND_A, investor_user_id: INVESTOR_1, investment_profile_id: "prof-individual", display_name: "Investor One", capacity: "lp", status: "active" },
    { id: "pos-2", offering_id: FUND_A, investor_user_id: INVESTOR_1, investment_profile_id: "prof-trust", display_name: "One Family Trust", capacity: "lp", status: "active" },
    { id: "pos-3", offering_id: FUND_B, investor_user_id: INVESTOR_2, investment_profile_id: "prof-other", display_name: "Investor Two", capacity: "lp", status: "active" },
  ],
  investment_profiles: [
    { id: "prof-individual", owner_user_id: INVESTOR_1, display_label: "Investor One", legal_name: "Investor One", profile_type: "individual", status: "active", created_at: "2026-01-01T00:00:00Z" },
    { id: "prof-trust", owner_user_id: INVESTOR_1, display_label: "One Family Trust", legal_name: "One Family Trust", profile_type: "trust", status: "active", created_at: "2026-01-01T00:00:00Z" },
    { id: "prof-other", owner_user_id: INVESTOR_2, display_label: "Investor Two", legal_name: "Investor Two", profile_type: "individual", status: "active", created_at: "2026-01-01T00:00:00Z" },
  ],
  profiles: [
    { user_id: INVESTOR_1, legal_name: "Investor One", email: "one@test.test", investor_type: "individual", country: "US", created_at: "2026-01-01T00:00:00Z", tax_id: "123-45-6789" },
    { user_id: INVESTOR_2, legal_name: "Investor Two", email: "two@test.test", investor_type: "individual", country: "US", created_at: "2026-01-01T00:00:00Z", tax_id: "987-65-4321" },
  ],
  bank_accounts: [
    { id: "bank-a", offering_id: FUND_A, institution_name: "Texas Capital", account_name: "Fund A Operating", account_mask: "123456789", status: "opened", last_synced_at: null },
  ],
  bank_transactions: [
    { id: "txn-a", offering_id: FUND_A, posted_on: "2026-03-01", amount_cents: 100_00, name: "Wire in", matched_application_id: null },
  ],
  ct_companies: [
    { id: COMPANY_A, client_id: CLIENT_A, name: "Company A", legal_name: "Company A Inc", entity_type: "c_corp", jurisdiction: "DE", incorporation_date: "2024-01-01", authorized_shares: 10_000_000, currency: "USD" },
  ],
  ct_stakeholders: [{ id: "sh-1", company_id: COMPANY_A, name: "Founder", entity_name: null, stakeholder_type: "founder", title: "CEO", email: "founder@a.test" }],
  ct_securities: [{ id: "sec-1", company_id: COMPANY_A, label: "CS-1", security_type: "common", quantity: 1000, status: "outstanding", stakeholder_id: "sh-1", class_id: "cls-1" }],
  ct_security_classes: [{ id: "cls-1", company_id: COMPANY_A, name: "Common" }],
  ct_transactions: [],
  ct_documents: [],
  ct_events: [
    { company_id: COMPANY_A, occurred_at: "2026-03-01T00:00:00Z", action: "security_issued", entity_type: "security", reason: "new grant", actor_id: STAFF_ADMIN, previous_state: { tax_id: "123-45-6789" }, new_state: { quantity: 1000 } },
  ],
  fund_compliance_items: [],
  fund_setup_documents: [],
  fund_setup_events: [
    { setup_id: "setup-a", created_at: "2026-03-01T00:00:00Z", event: "banking_approved", from_status: "requested", to_status: "opened", subject_table: "fund_banking_setups", actor_user_id: STAFF_ADMIN, actor_role: "operations" },
  ],
  fund_target_assets: [],
  asset_valuations: [],
  ledger_books: [],
  accounting_periods: [],
  journal_entries: [],
  nav_versions: [],
  allocation_runs: [],
  financial_reports: [],
  capital_calls: [],
  capital_call_lines: [],
  capital_accounts: [],
  expected_fundings: [],
  fund_tax_documents: [],
  k1_forms: [],
  investor_applications: [
    { id: "app-1", user_id: INVESTOR_1, offering_id: FUND_A, status: "approved", kyc_status: "approved", aml_status: "approved", accreditation_status: "approved", commitment_cents: 100_00 },
  ],
  kyc_verifications: [
    { application_id: "app-1", provider: "didit", status: "approved", completed_at: "2026-02-01T00:00:00Z", expired_at: null, vendor_data: { raw: "sensitive" } },
  ],
  aml_screenings: [{ application_id: "app-1", provider: "didit", status: "clear", completed_at: "2026-02-01T00:00:00Z", matches: { hit: false } }],
  accreditation_records: [{ application_id: "app-1", method: "income", status: "verified", verified_at: "2026-02-01T00:00:00Z", expires_at: null }],
  investor_documents: [],
  investor_onboarding_events: [],
  ai_action_log: [
    { client_id: CLIENT_A, created_at: "2026-03-01T00:00:00Z", actor_role: "operations", feature: "billing", action: "invoice_sent", summary: "Invoice 100 sent", actor_id: STAFF_ADMIN },
  ],
  fund_regulatory_configs: [],
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

const admin = () => contextFor(STAFF_ADMIN);

beforeEach(() => {});

describe("only Harmonious staff reach a record at all", () => {
  it("refuses someone who is merely signed in", async () => {
    await expect(ops.clientRecord(contextFor(OUTSIDER), { id: CLIENT_A })).rejects.toThrow(/Harmonious team/);
    await expect(ops.fundRecord(contextFor(OUTSIDER), { id: FUND_A })).rejects.toThrow(/Harmonious team/);
    await expect(ops.investorRecord(contextFor(OUTSIDER), { id: INVESTOR_1 })).rejects.toThrow(/Harmonious team/);
    await expect(ops.companyRecord(contextFor(OUTSIDER), { id: COMPANY_A })).rejects.toThrow(/Harmonious team/);
  });

  it("refuses a company record to staff without the companies capability", async () => {
    await expect(ops.companyRecord(contextFor(STAFF_SUCCESS), { id: COMPANY_A })).rejects.toThrow(/permission/);
  });

  it("refuses a tab whose area the staff member may not see", async () => {
    await expect(ops.fundTab(contextFor(STAFF_SUCCESS), { id: FUND_A, tab: "accounting" })).rejects.toThrow(
      /Harmonious team|permission/,
    );
  });

  it("refuses an invented tab name before reading anything", async () => {
    await expect(ops.fundTab(admin(), { id: FUND_A, tab: "everything" })).rejects.toThrow(/Not found/);
  });
});

describe("substituting an identifier gets nothing", () => {
  it("returns not found for an unknown id on every record type", async () => {
    await expect(ops.clientRecord(admin(), { id: UNKNOWN })).rejects.toThrow(/Not found/);
    await expect(ops.fundRecord(admin(), { id: UNKNOWN })).rejects.toThrow(/Not found/);
    await expect(ops.investorRecord(admin(), { id: UNKNOWN })).rejects.toThrow(/Not found/);
    await expect(ops.companyRecord(admin(), { id: UNKNOWN })).rejects.toThrow(/Not found/);
    await expect(ops.fundTab(admin(), { id: UNKNOWN, tab: "investors" })).rejects.toThrow(/Not found/);
  });
});

describe("one record never leaks another", () => {
  it("keeps Client B's fund out of Client A", async () => {
    const record = (await ops.clientRecord(admin(), { id: CLIENT_A })) as any;
    expect(record.record.fundCount).toBe(1);
    const tab = (await ops.clientTab(admin(), { id: CLIENT_A, tab: "funds" })) as any;
    expect(tab.funds.map((f: any) => f.id)).toEqual([FUND_A]);
  });

  it("keeps Fund B's investors out of Fund A", async () => {
    const tab = (await ops.fundTab(admin(), { id: FUND_A, tab: "investors" })) as any;
    expect(tab.investors).toHaveLength(2);
    expect(tab.investors.every((i: any) => i.investorUserId === INVESTOR_1)).toBe(true);
  });

  it("keeps Investor Two's profiles out of Investor One", async () => {
    const tab = (await ops.investorTab(admin(), { id: INVESTOR_1, tab: "profiles" })) as any;
    expect(tab.profiles.map((p: any) => p.id).sort()).toEqual(["prof-individual", "prof-trust"]);
  });
});

describe("investing profiles are never merged", () => {
  it("shows one person's individual and trust investments as separate lines", async () => {
    const tab = (await ops.fundTab(admin(), { id: FUND_A, tab: "investors" })) as any;
    const labels = tab.investors.map((i: any) => i.profileLabel).sort();
    expect(labels).toEqual(["Investor One", "One Family Trust"]);
    expect(new Set(tab.investors.map((i: any) => i.profileId)).size).toBe(2);
  });

  it("shows each profile's investment separately on the investor record", async () => {
    const tab = (await ops.investorTab(admin(), { id: INVESTOR_1, tab: "investments" })) as any;
    expect(tab.investments).toHaveLength(2);
    expect(new Set(tab.investments.map((i: any) => i.investment_profile_id)).size).toBe(2);
  });
});

describe("summary values come from the authoritative records", () => {
  it("adds fund commitments and funding from the onboarding records themselves", async () => {
    const record = (await ops.fundRecord(admin(), { id: FUND_A })) as any;
    expect(record.record.acceptedCents).toBe(500_00);
    expect(record.record.fundedCents).toBe(350_00);
    expect(record.record.investorCount).toBe(2);
    expect(record.record.stage).toBe("operating");
    expect(Object.keys(record.record)).not.toContain("ops_status");
  });

  it("counts company capitalisation from the cap-table records", async () => {
    const record = (await ops.companyRecord(admin(), { id: COMPANY_A })) as any;
    expect(record.record.stakeholderCount).toBe(1);
    expect(record.record.outstandingQuantity).toBe(1000);
  });
});

describe("bank detail is not handed over with the fund", () => {
  it("withholds account name, mask and feed from view-only staff", async () => {
    const tab = (await ops.fundTab(contextFor(STAFF_EXEC), { id: FUND_A, tab: "banking" })) as any;
    expect(tab.detailVisible).toBe(false);
    expect(tab.accounts[0].accountName).toBeNull();
    expect(tab.accounts[0].mask).toBeNull();
    expect(tab.transactions).toEqual([]);
  });

  it("masks the account to its last four digits even for reviewers", async () => {
    const tab = (await ops.fundTab(admin(), { id: FUND_A, tab: "banking" })) as any;
    expect(tab.detailVisible).toBe(true);
    expect(tab.accounts[0].mask).toBe("••••6789");
    expect(JSON.stringify(tab)).not.toContain("123456789");
  });
});

describe("activity shows what happened, not what was stored", () => {
  it("returns only the six audit fields and drops state blobs", async () => {
    const tab = (await ops.companyTab(admin(), { id: COMPANY_A, tab: "activity" })) as any;
    expect(Object.keys(tab.activity[0]).sort()).toEqual([
      "action",
      "actor",
      "at",
      "capacity",
      "detail",
      "resource",
    ]);
    expect(JSON.stringify(tab)).not.toContain("123-45-6789");
  });

  it("keeps identity provider payloads out of the investor identity summary", async () => {
    const tab = (await ops.investorTab(admin(), { id: INVESTOR_1, tab: "identity" })) as any;
    expect(tab.kyc[0].status).toBe("approved");
    expect(JSON.stringify(tab)).not.toContain("sensitive");
    expect(JSON.stringify(tab)).not.toContain("vendor_data");
  });

  it("never carries a tax identifier into an investor record", async () => {
    const record = (await ops.investorRecord(admin(), { id: INVESTOR_1 })) as any;
    expect(JSON.stringify(record)).not.toContain("123-45-6789");
  });
});
