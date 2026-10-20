import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory fake of the database client: supports the read calls the readiness loaders use.
const tables: Record<string, any[]> = {};
const state = { requests: 0, failTable: null as string | null };

function query(table: string) {
  const filters: ((r: any) => boolean)[] = [];
  let orderBy: { col: string; asc: boolean } | null = null;
  let lim: number | null = null;
  const q: any = {
    select: () => q,
    eq: (c: string, v: any) => (filters.push((r) => r[c] === v), q),
    or: () => q,
    neq: (c: string, v: any) => (filters.push((r) => r[c] !== v), q),
    in: (c: string, vs: any[]) => (filters.push((r) => vs.includes(r[c])), q),
    is: (c: string, v: any) => (filters.push((r) => (r[c] ?? null) === v), q),
    not: () => q,
    order: (col: string, o?: { ascending?: boolean }) => ((orderBy = { col, asc: o?.ascending !== false }), q),
    limit: (n: number) => ((lim = n), q),
    run() {
      state.requests++;
      if (state.failTable === table) return { data: null, error: { message: `boom on ${table}` } };
      let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).map((r) => ({ ...r }));
      if (orderBy) { const { col, asc } = orderBy; rows.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1)); }
      if (lim != null) rows = rows.slice(0, lim);
      return { data: rows, error: null };
    },
    maybeSingle: async () => { const r = q.run(); return r.error ? r : { data: r.data.length === 1 ? r.data[0] : null, error: null }; },
    single: async () => q.maybeSingle(),
    then: (res: any, rej: any) => Promise.resolve(q.run()).then(res, rej),
  };
  return q;
}
const fake = { from: (t: string) => query(t) };
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: fake }));

const OFF = "off-1";
function seed() {
  for (const k of Object.keys(tables)) delete tables[k];
  Object.assign(tables, {
    offerings: [{ id: OFF, reg_type: "506b", min_investment_cents: 5_000_000 }],
    offering_requirements: [{ offering_id: OFF, accreditation_required: true, requires_person_kyc: true }],
    fund_setups: [{ id: "setup-1", offering_id: OFF, min_investment_cents: 5_000_000, launch_state: "ready" }],
    fund_eligibility_configs: [{ setup_id: "setup-1", status: "approved", version: 2, rules: { taxDocumentRequired: true } }],
    persons: [
      { id: "p1", user_id: "u1", kyc_status: "approved", aml_status: "clear", residence_country: "US" },
      { id: "p2", user_id: "u2", kyc_status: "pending", residence_country: "IE" },
      { id: "p3", user_id: "u3", kyc_status: "approved", residence_country: "US" },
    ],
    investment_profiles: [
      { id: "ip1", profile_type: "individual" },
      { id: "ip2", profile_type: "llc" },
    ],
    entity_verifications: [{ profile_id: "ip2", kyb_status: "approved", entity_aml_status: "clear" }],
    investment_profile_relationships: [{ profile_id: "ip2", role: "beneficial_owner", person_id: "p2", verification_status: "pending" }],
    accreditation_records: [{ application_id: "app1", status: "verified", method: "letter" }],
    investor_tax_profiles: [{ investment_profile_id: "ip1", documentation_status: "valid", classification: "us_individual" }],
    offering_documents: [
      { id: "doc-sub", offering_id: OFF, title: "Subscription", doc_type: "subscription_agreement", requires_signature: true, usage: "signature", sort_order: 1, active_version: 1 },
      { id: "doc-ppm", offering_id: OFF, title: "PPM", doc_type: "ppm", requires_signature: false, usage: "acknowledgment", sort_order: 0, active_version: 1 },
    ],
    document_signatures: [
      { id: "sig1", application_id: "app1", investment_profile_id: "ip1", offering_document_id: "doc-sub", status: "completed", completed_at: "2026-01-02", source: "box_sign_webhook" },
      { id: "sig2", application_id: null, investment_profile_id: "ip2", offering_document_id: "doc-sub", status: "completed", snapshot_id: "snap-dead" },
    ],
    investment_document_acknowledgments: [{ onboarding_id: "ob1", offering_document_id: "doc-ppm", version: 1 }],
    investor_document_snapshots: [{ id: "snap-dead", onboarding_id: "ob2", status: "stale" }],
    investor_onboarding_exceptions: [{ id: "ex1", onboarding_id: "ob2", status: "open", severity: "blocking", owner: "harmonious", exception_type: "aml" }],
    prior_subscriptions: [{ id: "ps1", onboarding_id: "ob3", version: 1, funded_cents: 10_000_000, signed_on: "2024-05-01", prior_subscription_decisions: [{ decision: "confirmed" }] }],
    investor_tax_facts: [],
    investor_tax_forms: [{ id: "tf1", investment_profile_id: "ip1", form_type: "W-9", status: "valid", expires_on: null }],
    compliance_questionnaire_responses: [{ id: "q1", onboarding_id: "ob1", kind: "bsa_aml", review_status: "cleared", superseded_by: null, created_at: "2026-01-01" }],
    investor_certifications: [],
    fund_managers: [{ offering_id: OFF, user_id: "u2" }],
    investor_prep_drafts: [],
    investor_prep_field_reviews: [],
  });
  tables["investor_onboardings"] = ROWS.map((r) => ({ ...r }));
}

const ROWS = [
  { id: "ob1", offering_id: OFF, person_id: "p1", investor_user_id: "u1", investment_profile_id: "ip1", application_id: "app1", stage: "funding", questionnaire_version: 1, document_template_version: 1, requested_amount_cents: 10_000_000, invitation_id: null },
  { id: "ob2", offering_id: OFF, person_id: "p2", investor_user_id: "u2", investment_profile_id: "ip2", application_id: null, stage: "signing", requested_amount_cents: 2_000_000, invitation_id: null },
  { id: "ob3", offering_id: OFF, person_id: null, investor_user_id: "u3", investment_profile_id: null, application_id: null, stage: "invited", invitation_id: null },
  { id: "ob4", offering_id: OFF, person_id: null, investor_user_id: "nobody", investment_profile_id: null, application_id: null, stage: "invited", invitation_id: null },
];

describe("batch readiness equals single readiness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    seed();
    state.requests = 0;
    state.failTable = null;
  });

  it("returns the same result and facts for every investor", async () => {
    const { computeReadinessFor, readinessForMany } = await import("@/lib/investor-onboarding.server");
    const batch = await readinessForMany(ROWS);
    expect(batch).toHaveLength(ROWS.length);
    for (let i = 0; i < ROWS.length; i++) {
      const single = await computeReadinessFor(ROWS[i]);
      expect(batch[i]).toEqual(single);
    }
    // Sanity: the fixtures actually exercise different outcomes.
    expect(new Set(batch.map((b) => JSON.stringify(b.result.items.map((x) => x.status)))).size).toBeGreaterThan(1);
  });

  it("batch reads do not grow with the number of investors", async () => {
    const { readinessForMany } = await import("@/lib/investor-onboarding.server");
    state.requests = 0;
    await readinessForMany(ROWS);
    const four = state.requests;
    const many = Array.from({ length: 40 }, (_, i) => ({ ...ROWS[i % ROWS.length]!, id: `${ROWS[i % ROWS.length]!.id}-${i}` }));
    state.requests = 0;
    await readinessForMany(many);
    expect(state.requests).toBe(four);
    expect(four).toBeLessThanOrEqual(35);
  });

  it("a failed read is logged and treated as no rows, never thrown", async () => {
    const { readinessForMany, computeReadinessFor } = await import("@/lib/investor-onboarding.server");
    const errors: unknown[][] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => { errors.push(args); };
    try {
      for (const t of ["persons", "document_signatures", "investor_onboarding_exceptions", "prior_subscriptions", "investor_tax_forms"]) {
        state.failTable = t;
        const batch = await readinessForMany(ROWS);
        expect(batch).toHaveLength(ROWS.length);
        await expect(computeReadinessFor(ROWS[0])).resolves.toBeDefined();
      }
    } finally {
      console.error = orig;
    }
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((a) => String(a[0]).includes("failed"))).toBe(true);
  });
});
