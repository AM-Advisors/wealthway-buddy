import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adversarial tests for the investor reporting centre.
 *
 * Every id here arrives "from the browser". The server must re-read the record,
 * authorise against the fund and investor it truly belongs to, keep one
 * person's investment profiles separate, and never rewrite a published package.
 */

const FUND_A = "11111111-1111-4111-8111-111111111111";
const FUND_B = "22222222-2222-4222-8222-222222222222";

const PKG_A_DRAFT = "aaaa1111-1111-4111-8111-111111111111";
const PKG_A_BLOCKED = "aaaa1111-2222-4222-8222-222222222222";
const PKG_A_APPROVED = "aaaa1111-3333-4333-8333-333333333333";
const PKG_A_PUBLISHED = "aaaa1111-4444-4444-8444-444444444444";
const PKG_TRUST_PUBLISHED = "aaaa1111-5555-4555-8555-555555555555";
const PKG_B_PUBLISHED = "bbbb2222-2222-4222-8222-222222222222";

const MANAGER_A = "manager-a";
const MANAGER_B = "manager-b";
const GENERATOR = "admin-generator";
const APPROVER = "admin-approver";
const INVESTOR = "investor-amy";
const OTHER_INVESTOR = "investor-ben";
const CPA = "cpa-carl";

const PROFILE_INDIVIDUAL = "profile-individual";
const PROFILE_TRUST = "profile-trust";

type Write = { table: string; op: string; payload: any };
let writes: Write[] = [];

const manifest = (over: Record<string, unknown> = {}) => ({
  investorUserId: INVESTOR,
  offeringId: FUND_A,
  periodStart: "2026-01-01",
  periodEnd: "2026-03-31",
  templateCode: "vc_quarterly",
  templateVersion: 1,
  navVersionId: "nav-1",
  navVersion: 3,
  capitalStatementId: "stmt-1",
  capitalStatementVersion: 2,
  performanceRunId: "perf-1",
  performanceVersion: 1,
  financialReportIds: ["fin-1"],
  generatedBy: GENERATOR,
  approvedBy: APPROVER,
  publishedBy: APPROVER,
  ...over,
});

const pkg = (over: Record<string, unknown>) => ({
  offering_id: FUND_A,
  investor_user_id: INVESTOR,
  investment_profile_id: PROFILE_INDIVIDUAL,
  position_id: "pos-a",
  template_code: "vc_quarterly",
  template_version: 1,
  period_kind: "quarter",
  period_start: "2026-01-01",
  period_end: "2026-03-31",
  period_label: "Q1 2026",
  status: "draft",
  version: 1,
  sections: ["cover", "nav_summary", "capital_account"],
  manifest: manifest(),
  exceptions: [],
  generated_by: GENERATOR,
  ...over,
});

const tables: Record<string, any[]> = {
  user_roles: [
    { user_id: MANAGER_A, role: "fund_manager" },
    { user_id: MANAGER_B, role: "fund_manager" },
    { user_id: GENERATOR, role: "admin" },
    { user_id: APPROVER, role: "admin" },
  ],
  fund_managers: [
    { user_id: MANAGER_A, offering_id: FUND_A },
    { user_id: MANAGER_B, offering_id: FUND_B },
  ],
  offerings: [
    { id: FUND_A, name: "Fund A", fund_type: "venture" },
    { id: FUND_B, name: "Fund B", fund_type: "venture" },
  ],
  fund_reporting_policies: [
    {
      id: "policy-a",
      offering_id: FUND_A,
      portfolio_visibility: "summary",
      portfolio_columns: ["asset", "value", "pct_nav", "status"],
      branding: {},
      administrator_attribution: "Administered by Harmonious",
      contact: {},
      manager_review_enabled: true,
    },
  ],
  investor_packages: [
    pkg({ id: PKG_A_DRAFT }),
    pkg({
      id: PKG_A_BLOCKED,
      status: "approved",
      approved_by: APPROVER,
      exceptions: [
        { kind: "missing_component", severity: "blocking", detail: "No capital statement." },
      ],
    }),
    pkg({ id: PKG_A_APPROVED, status: "approved", approved_by: APPROVER }),
    pkg({
      id: PKG_A_PUBLISHED,
      status: "published",
      approved_by: APPROVER,
      published_by: APPROVER,
      published_at: "2026-04-10T00:00:00Z",
    }),
    pkg({
      id: PKG_TRUST_PUBLISHED,
      status: "published",
      investment_profile_id: PROFILE_TRUST,
      position_id: "pos-trust",
      approved_by: APPROVER,
      published_by: APPROVER,
    }),
    pkg({
      id: PKG_B_PUBLISHED,
      offering_id: FUND_B,
      investor_user_id: OTHER_INVESTOR,
      investment_profile_id: "profile-ben",
      position_id: "pos-b",
      status: "published",
      approved_by: APPROVER,
      published_by: APPROVER,
    }),
  ],
  investor_package_components: [
    {
      id: "comp-1",
      package_id: PKG_A_PUBLISHED,
      offering_id: FUND_A,
      section_key: "nav_summary",
      title: "Fund net asset value",
      source_table: "nav_versions",
      source_id: "nav-1",
      source_version: 3,
      source_status: "approved",
      sort_order: 0,
      snapshot: {},
    },
    {
      id: "comp-2",
      package_id: PKG_A_PUBLISHED,
      offering_id: FUND_A,
      section_key: "capital_account",
      title: "Your capital account statement",
      source_table: "investor_statements",
      source_id: "stmt-1",
      source_version: 2,
      source_status: "published",
      sort_order: 1,
      snapshot: {},
    },
  ],
  investment_profiles: [
    { id: PROFILE_INDIVIDUAL, display_label: "Amy Individual", profile_type: "individual" },
    { id: PROFILE_TRUST, display_label: "Amy Family Trust", profile_type: "trust" },
  ],
  investor_positions: [
    {
      id: "pos-a",
      offering_id: FUND_A,
      investor_user_id: INVESTOR,
      investment_profile_id: PROFILE_INDIVIDUAL,
      status: "active",
      display_name: "Amy",
      capacity: "individual",
    },
  ],
  reporting_delivery_events: [],
  reporting_package_templates: [],
  investor_notices: [],
  investor_notice_targets: [],
  investor_statements: [],
  investor_documents: [],
  performance_lines: [],
  performance_runs: [],
  nav_versions: [],
  financial_reports: [],
  commitment_events: [],
  fund_distributions: [],
  profiles: [{ id: "p-amy", user_id: INVESTOR }],
  delegations: [
    {
      id: "del-view",
      principal_user_id: INVESTOR,
      delegate_user_id: CPA,
      organization_id: null,
      scope_type: "person",
      scope_id: INVESTOR,
      authority_level: "view",
      status: "active",
      acceptance_state: "not_required", // DB default (NOT NULL)
      effective_at: "2026-01-01T00:00:00Z",
      expires_at: null,
      revoked_at: null,
    },
  ],
  // The CPA may look at the investments, but was never granted the financial
  // statement capability that the capital account section requires.
  delegation_permissions: [{ id: "perm-1", delegation_id: "del-view", capability: "view_investments" }],
  professional_memberships: [],
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

const server = await import("@/lib/investor-reporting.server");

beforeEach(() => {
  writes = [];
});

const updates = (table: string) => writes.filter((w) => w.table === table && w.op === "update");
const inserts = (table: string) => writes.filter((w) => w.table === table && w.op === "insert");

describe("investor isolation", () => {
  it("refuses to open another investor's package", async () => {
    await expect(server.investorPackageDetail(INVESTOR, PKG_B_PUBLISHED)).rejects.toThrow();
  });

  it("lets the investor open their own published package", async () => {
    const detail = await server.investorPackageDetail(INVESTOR, PKG_A_PUBLISHED);
    expect(detail.package.id).toBe(PKG_A_PUBLISHED);
    expect(detail.components).toHaveLength(2);
  });

  it("keeps Individual and Trust packages separate", async () => {
    const centre = await server.investorReportingCenter(INVESTOR);
    const labels = centre.profiles.map((p: any) => p.profileLabel).sort();
    expect(labels).toEqual(["Amy Family Trust", "Amy Individual"]);
    expect(centre.profiles).toHaveLength(2);
  });

  it("records an auditable portal open, not an email guess", async () => {
    await server.investorPackageDetail(INVESTOR, PKG_A_PUBLISHED);
    const event = inserts("reporting_delivery_events")[0]?.payload;
    expect(event.event).toBe("opened");
    expect(event.channel).toBe("portal");
    expect(event.investor_user_id).toBe(INVESTOR);
  });

  it("records downloads and acknowledgements", async () => {
    await server.recordPackageInteraction(INVESTOR, PKG_A_PUBLISHED, "downloaded");
    await server.recordPackageInteraction(INVESTOR, PKG_A_PUBLISHED, "acknowledged");
    expect(inserts("reporting_delivery_events").map((w) => w.payload.event)).toEqual([
      "downloaded",
      "acknowledged",
    ]);
  });
});

describe("manifest and published component versions", () => {
  it("names the exact component versions the package was built from", async () => {
    const detail = await server.packageDetail(APPROVER, PKG_A_PUBLISHED);
    expect((detail.manifest as any).navVersion).toBe(3);
    expect((detail.manifest as any).capitalStatementVersion).toBe(2);
    expect(detail.components.map((c: any) => c.source_version)).toEqual([3, 2]);
  });

  it("keeps a published package readable after later accounting activity", async () => {
    // the component snapshot is frozen: nothing here re-reads nav_versions
    const before = await server.packageDetail(APPROVER, PKG_A_PUBLISHED);
    tables["nav_versions"] = [
      { id: "nav-2", offering_id: FUND_A, version: 9, status: "published", as_of_date: "2026-03-31" },
    ];
    const after = await server.packageDetail(APPROVER, PKG_A_PUBLISHED);
    expect(after.components).toEqual(before.components);
    tables["nav_versions"] = [];
  });
});

describe("lifecycle and segregation", () => {
  it("refuses to let a fund manager generate packages", async () => {
    await expect(
      server.generatePackages(MANAGER_A, {
        offeringId: FUND_A,
        periodKind: "quarter",
        periodEnd: "2026-03-31",
      }),
    ).rejects.toThrow(/Harmonious/);
  });

  it("stops the generator publishing their own package", async () => {
    await expect(server.advancePackage(GENERATOR, PKG_A_APPROVED, "published")).rejects.toThrow(
      /cannot publish/,
    );
  });

  it("blocks publication while a required component is missing", async () => {
    await expect(server.advancePackage(APPROVER, PKG_A_BLOCKED, "published")).rejects.toThrow(
      /cannot be published/,
    );
  });

  it("publishes a complete, approved package and logs the publication", async () => {
    await server.advancePackage(APPROVER, PKG_A_APPROVED, "published");
    expect(updates("investor_packages")[0]?.payload.status).toBe("published");
    expect(inserts("reporting_delivery_events")[0]?.payload.event).toBe("published");
  });

  it("refuses an illegal transition", async () => {
    await expect(server.advancePackage(APPROVER, PKG_A_DRAFT, "published")).rejects.toThrow(
      /cannot move/,
    );
  });

  it("amends by superseding, never by rewriting", async () => {
    await expect(server.revisePackage(APPROVER, PKG_A_PUBLISHED, "short")).rejects.toThrow(
      /why the published package/,
    );
    await server.revisePackage(APPROVER, PKG_A_PUBLISHED, "Financial statements were amended.");
    const statuses = updates("investor_packages").map((w) => w.payload.status);
    expect(statuses).toContain("superseded");
    expect(inserts("investor_packages")).toHaveLength(1);
  });
});

describe("fund managers", () => {
  it("shows a manager only the funds they manage", async () => {
    const mine = await server.managerPackages(MANAGER_A);
    expect(mine.packages.every((p: any) => p.offering_id === FUND_A)).toBe(true);
    const theirs = await server.managerPackages(MANAGER_B);
    expect(theirs.packages.every((p: any) => p.offering_id === FUND_B)).toBe(true);
  });

  it("refuses a manager opening another fund's package", async () => {
    await expect(server.packageDetail(MANAGER_B, PKG_A_PUBLISHED)).rejects.toThrow();
  });

  it("lets the fund's manager acknowledge but never re-author", async () => {
    await server.managerRespondToPackage(MANAGER_A, PKG_A_PUBLISHED, "acknowledged");
    expect(updates("investor_packages")[0]?.payload.manager_response).toBe("acknowledged");
    await expect(server.advancePackage(MANAGER_A, PKG_A_APPROVED, "published")).rejects.toThrow(
      /Harmonious/,
    );
  });

  it("requires a reason when a manager challenges", async () => {
    await expect(
      server.managerRespondToPackage(MANAGER_A, PKG_A_PUBLISHED, "challenged", "bad"),
    ).rejects.toThrow(/describe what looks wrong/);
  });
});

describe("professional delegated access", () => {
  it("needs the explicit capability for each section", async () => {
    const detail = await server.investorPackageDetail(CPA, PKG_A_PUBLISHED, {
      onBehalfOfUserId: INVESTOR,
    });
    // view_investments covers the NAV summary; the capital account section
    // needs view_financial_statements, which this delegation never granted.
    expect(detail.components.map((c: any) => c.section_key)).toEqual(["nav_summary"]);
    expect(detail.delegated).toBe(true);
  });

  it("refuses a professional with no delegation at all", async () => {
    await expect(
      server.investorPackageDetail(OTHER_INVESTOR, PKG_A_PUBLISHED, {
        onBehalfOfUserId: INVESTOR,
      }),
    ).rejects.toThrow(/Forbidden/);
  });

  it("never lets a delegate acknowledge on the investor's behalf", async () => {
    await expect(
      server.recordPackageInteraction(CPA, PKG_A_PUBLISHED, "acknowledged", {
        onBehalfOfUserId: INVESTOR,
      }),
    ).rejects.toThrow(/Only the investor/);
  });
});

describe("operations", () => {
  it("is Harmonious-only", async () => {
    await expect(server.reportingOperations(MANAGER_A)).rejects.toThrow(/Harmonious/);
  });

  it("separates exceptions, review and delivery for staff", async () => {
    const queue = await server.reportingOperations(APPROVER);
    expect(queue.exceptions.map((p: any) => p.id)).toContain(PKG_A_BLOCKED);
    expect(queue.readyToPublish.map((p: any) => p.id)).toContain(PKG_A_APPROVED);
    expect(queue.published.map((p: any) => p.id)).toContain(PKG_A_PUBLISHED);
    expect(queue.delivery.length).toBeGreaterThan(0);
  });
});
