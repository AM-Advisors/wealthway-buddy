import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 3A adversarial tests — read-only delegated access.
 *
 * Every assertion here is about what a professional can reach, not what the UI
 * chooses to render: the workspace is built entirely from `canAct` decisions
 * over resolved resources.
 */

const PRINCIPAL_A = "11111111-1111-4111-8111-00000000000a";
const PRINCIPAL_B = "11111111-1111-4111-8111-00000000000b";
const PRO_A = "22222222-2222-4222-8222-00000000000a";
const PRO_B = "22222222-2222-4222-8222-00000000000b";
const ORG = "33333333-3333-4333-8333-00000000000a";
const PROFILE_A1 = "44444444-4444-4444-8444-000000000001";
const PROFILE_A2 = "44444444-4444-4444-8444-000000000002";
const FUND_A = "55555555-5555-4555-8555-00000000000a";
const FUND_B = "55555555-5555-4555-8555-00000000000b";
const APP_A = "66666666-6666-4666-8666-00000000000a";
const APP_A2 = "66666666-6666-4666-8666-00000000000c";
const APP_B = "66666666-6666-4666-8666-00000000000b";

const HOUR = 3600_000;
const past = new Date(Date.now() - 48 * HOUR).toISOString();
const future = new Date(Date.now() + 48 * HOUR).toISOString();

const delegations: Record<string, any>[] = [];
const permissions: { delegation_id: string; capability: string }[] = [];
const memberships: Record<string, any>[] = [];

function delegation(over: Record<string, any>, caps: string[]): string {
  const id = `d${delegations.length + 1}`;
  delegations.push({
    id,
    principal_user_id: PRINCIPAL_A,
    delegate_user_id: PRO_A,
    organization_id: null,
    scope_type: "person",
    scope_id: PRINCIPAL_A,
    authority_level: "view",
    status: "active",
    effective_at: past,
    expires_at: null,
    revoked_at: null,
    last_used_at: null,
    ...over,
  });
  for (const capability of caps) permissions.push({ delegation_id: id, capability });
  return id;
}

const tables: Record<string, any[]> = {
  delegations,
  delegation_permissions: permissions,
  professional_memberships: memberships,
  professional_organizations: [{ id: ORG, name: "Rowan & Fitch LLP", org_type: "law_firm" }],
  delegation_audit_events: [],
  profiles: [
    { id: PROFILE_A1, user_id: PRINCIPAL_A },
    { id: PROFILE_A2, user_id: PRINCIPAL_A },
  ],
  persons: [
    {
      user_id: PRINCIPAL_A,
      legal_first_name: "Jane",
      legal_last_name: "Smith",
      email: "jane@example.com",
      date_of_birth: "1970-01-01",
      tax_id_reference: "vault://ssn",
      kyc_status: "approved",
      aml_status: "approved",
      onboarding_state: "verified",
    },
    { user_id: PRINCIPAL_B, legal_first_name: "Bob", legal_last_name: "Other" },
  ],
  investment_profiles: [
    { id: PROFILE_A1, owner_user_id: PRINCIPAL_A, display_label: "Jane Smith", profile_type: "individual", status: "active" },
    { id: PROFILE_A2, owner_user_id: PRINCIPAL_A, display_label: "Smith Holdings LLC", profile_type: "llc", status: "active" },
  ],
  offerings: [
    { id: FUND_A, name: "Fund A", reg_type: "506c" },
    { id: FUND_B, name: "Fund B", reg_type: "506c" },
  ],
  investor_applications: [
    { id: APP_A, user_id: PRINCIPAL_A, offering_id: FUND_A, status: "submitted", commitment_cents: 100000, funding_status: "settled", offerings: { id: FUND_A, name: "Fund A", reg_type: "506c" } },
    { id: APP_A2, user_id: PRINCIPAL_A, offering_id: FUND_B, status: "submitted", commitment_cents: 50000, funding_status: "settled", offerings: { id: FUND_B, name: "Fund B", reg_type: "506c" } },
    { id: APP_B, user_id: PRINCIPAL_B, offering_id: FUND_B, status: "submitted", commitment_cents: 1, funding_status: "settled", offerings: { id: FUND_B, name: "Fund B", reg_type: "506c" } },
  ],
  investor_documents: [
    { id: "doc-a", application_id: APP_A, doc_kind: "subscription", file_name: "sub.pdf", review_status: "approved", uploaded_at: past },
  ],
  fund_tax_documents: [
    { id: "tax-a", offering_id: FUND_A, investor_user_id: PRINCIPAL_A, doc_type: "k1", file_name: "k1.pdf", tax_year: 2025, review_status: "approved" },
  ],
  capital_account_statements: [
    { id: "st-a", application_id: APP_A, statement_date: past, period_end: past, version: 1, superseded: false },
  ],
  bank_accounts: [
    { id: "bank-a", offering_id: FUND_A, institution_name: "First Bank", account_name: "Fund A ops", account_mask: "987654321234", status: "active" },
  ],
  profile_accreditations: [
    { profile_id: PROFILE_A1, status: "approved", basis: "income", expires_at: null },
  ],
  user_roles: [],
};

const writes: { table: string; op: string; payload: any }[] = [];

function builder(table: string) {
  let rows = [...(tables[table] ?? [])];
  const api: any = {
    select: () => api,
    order: () => api,
    limit: () => api,
    in: (col: string, vals: unknown[]) => {
      rows = rows.filter((r) => vals.includes(r[col]));
      return api;
    },
    eq: (col: string, val: unknown) => {
      rows = rows.filter((r) => r[col] === val);
      return api;
    },
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve: any) => resolve({ data: rows, error: null }),
    insert: (payload: any) => {
      writes.push({ table, op: "insert", payload });
      if (table === "delegation_audit_events") tables[table]!.push(payload);
      return Promise.resolve({ data: null, error: null });
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

import {
  buildDelegatedClientView,
  listDelegatedClients,
  loadDelegatedContext,
} from "./professional-access.server";
import { PHASE_3A_CAPABILITIES, SENSITIVE_CAPABILITIES } from "./professional-model";
import { READ_ONLY_CAPABILITIES } from "./delegation-model";

const ALL_VIEW = [
  "view_profile",
  "view_investments",
  "view_documents",
  "view_tax_documents",
  "view_financial_statements",
  "view_compliance_status",
];

beforeEach(() => {
  writes.length = 0;
});

describe("professional workspace", () => {
  it("shows nothing for organization membership alone", async () => {
    memberships.push({ id: "m1", organization_id: ORG, user_id: PRO_A, status: "active" });
    expect(await listDelegatedClients(PRO_A)).toEqual([]);
    expect(await loadDelegatedContext(PRO_A, "nope")).toBeNull();
  });

  it("exposes only the intended client through a live delegation", async () => {
    delegation({}, ALL_VIEW);
    const clients = await listDelegatedClients(PRO_A);
    expect(clients).toHaveLength(1);
    expect(clients[0]!.principalName).toBe("Jane Smith");

    const view = await buildDelegatedClientView(PRO_A, "d1");
    expect(view.investments.map((i: any) => i.id).sort()).toEqual([APP_A, APP_A2].sort());
    expect(view.investments.some((i: any) => i.id === APP_B)).toBe(false);
  });

  it("never returns date of birth, tax identifiers or provider payloads", async () => {
    const view = await buildDelegatedClientView(PRO_A, "d1");
    const json = JSON.stringify(view);
    expect(json).not.toContain("1970-01-01");
    expect(json).not.toContain("vault://ssn");
    expect(view.person.name).toBe("Jane Smith");
    expect(view.compliance.identity).toBe("Verified");
  });

  it("cannot be used by a different professional", async () => {
    expect(await loadDelegatedContext(PRO_B, "d1")).toBeNull();
    expect(await buildDelegatedClientView(PRO_B, "d1")).toBeNull();
  });

  it("refuses anonymous callers", async () => {
    expect(await loadDelegatedContext(null, "d1")).toBeNull();
    expect(await listDelegatedClients(undefined)).toEqual([]);
  });

  it("keeps a profile-scoped delegation off the client's other profile", async () => {
    delegation(
      { delegate_user_id: PRO_B, scope_type: "investment_profile", scope_id: PROFILE_A1 },
      ["view_profile"],
    );
    const view = await buildDelegatedClientView(PRO_B, "d2");
    expect(view.profiles.map((p: any) => p.id)).toEqual([PROFILE_A1]);
    expect(view.profiles.some((p: any) => p.id === PROFILE_A2)).toBe(false);
  });

  it("keeps a fund-scoped delegation inside its own fund", async () => {
    delegation(
      { delegate_user_id: PRO_B, scope_type: "fund", scope_id: FUND_A },
      ["view_investments"],
    );
    const view = await buildDelegatedClientView(PRO_B, "d3");
    expect(view.investments.map((i: any) => i.id)).toEqual([APP_A]);
    expect(view.funds.map((f: any) => f.id)).toEqual([FUND_A]);
  });

  it("keeps an investment-scoped delegation on one investment", async () => {
    delegation(
      { delegate_user_id: PRO_B, scope_type: "investment", scope_id: APP_A },
      ["view_investments", "view_documents"],
    );
    const view = await buildDelegatedClientView(PRO_B, "d4");
    expect(view.investments.map((i: any) => i.id)).toEqual([APP_A]);
    expect(view.documents.every((d: any) => d.investmentId === APP_A)).toBe(true);
  });

  it("does not let a tax permission reveal banking, or a document permission reveal investments", async () => {
    delegation({ delegate_user_id: PRO_B }, ["view_tax_documents"]);
    const taxOnly = await buildDelegatedClientView(PRO_B, "d5");
    expect(taxOnly.banking).toHaveLength(0);
    expect(taxOnly.person).toBeNull();

    delegation({ delegate_user_id: PRO_B }, ["view_documents"]);
    const docsOnly = await buildDelegatedClientView(PRO_B, "d6");
    expect(docsOnly.investments).toHaveLength(0);
    expect(docsOnly.documents).toHaveLength(0);
  });

  it("only ever shows the last four digits of a bank account, and records the view", async () => {
    delegation({ delegate_user_id: PRO_B, authority_level: "limited_proxy" }, [
      "view_investments",
      "view_banking_info",
    ]);
    const view = await buildDelegatedClientView(PRO_B, "d7");
    expect(view.banking[0].endingIn).toBe("1234");
    expect(JSON.stringify(view)).not.toContain("987654321234");
    expect(
      writes.some(
        (w) => w.table === "delegation_audit_events" && w.payload.action === "delegated_banking_view",
      ),
    ).toBe(true);
  });

  it("fails an expired delegation", async () => {
    delegation(
      { delegate_user_id: PRO_B, expires_at: new Date(Date.now() - HOUR).toISOString() },
      ALL_VIEW,
    );
    expect(await buildDelegatedClientView(PRO_B, "d8")).toBeNull();
  });

  it("fails a future-dated delegation", async () => {
    delegation({ delegate_user_id: PRO_B, effective_at: future }, ALL_VIEW);
    expect(await buildDelegatedClientView(PRO_B, "d9")).toBeNull();
  });

  it("fails a suspended delegation", async () => {
    delegation({ delegate_user_id: PRO_B, status: "suspended" }, ALL_VIEW);
    expect(await buildDelegatedClientView(PRO_B, "d10")).toBeNull();
  });

  it("fails immediately once revoked, whatever the browser cached", async () => {
    const id = delegation({ delegate_user_id: PRO_B }, ALL_VIEW);
    expect(await buildDelegatedClientView(PRO_B, id)).not.toBeNull();
    const row = delegations.find((d) => d["id"] === id)!;
    row["status"] = "revoked";
    row["revoked_at"] = new Date().toISOString();
    expect(await buildDelegatedClientView(PRO_B, id)).toBeNull();
  });

  it("fails when the firm seat is suspended", async () => {
    memberships.push({ id: "m2", organization_id: ORG, user_id: PRO_B, status: "suspended" });
    delegation({ delegate_user_id: PRO_B, organization_id: ORG }, ALL_VIEW);
    expect(await buildDelegatedClientView(PRO_B, "d12")).toBeNull();
  });

  it("cannot reach another principal by substituting ids", async () => {
    delegation({ delegate_user_id: PRO_B, principal_user_id: PRINCIPAL_B, scope_id: PRINCIPAL_B }, [
      "view_investments",
    ]);
    const view = await buildDelegatedClientView(PRO_B, "d13");
    expect(view.investments.map((i: any) => i.id)).toEqual([APP_B]);
    expect(view.investments.some((i: any) => i.id === APP_A)).toBe(false);
  });

  it("writes no client data while reading", async () => {
    writes.length = 0;
    await buildDelegatedClientView(PRO_A, "d1");
    const forbidden = writes.filter(
      (w) =>
        !(w.table === "delegation_audit_events" && w.op === "insert") &&
        !(w.table === "delegations" && w.op === "update"),
    );
    expect(forbidden).toEqual([]);
  });
});

describe("Phase 3A activation limits", () => {
  it("activates viewing capabilities only", () => {
    for (const cap of PHASE_3A_CAPABILITIES) {
      expect(READ_ONLY_CAPABILITIES.has(cap)).toBe(true);
    }
  });

  it("keeps banking and wire instructions as separate opt-ins", () => {
    expect(SENSITIVE_CAPABILITIES).toContain("view_banking_info");
    expect(SENSITIVE_CAPABILITIES).toContain("view_wire_instructions");
  });

  it("offers no assist, signing or transaction capability", () => {
    for (const cap of ["upload_documents", "sign_specified_documents", "initiate_investment"]) {
      expect(PHASE_3A_CAPABILITIES).not.toContain(cap as never);
    }
  });
});
