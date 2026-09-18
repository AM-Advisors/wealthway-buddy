import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adversarial tests for Fund Administration Phase A.
 *
 * Every id here arrives "from the browser". The server must re-read the
 * record, authorise against the fund it truly belongs to, keep Harmonious
 * controls out of client hands, and never open a fund to investors without an
 * explicit Harmonious approval.
 */

const FUND_A = "11111111-1111-4111-8111-111111111111";
const FUND_B = "22222222-2222-4222-8222-222222222222";
const FUND_L = "33333333-3333-4333-8333-333333333333";
const FUND_R = "44444444-4444-4444-8444-444444444444";
const FUND_G = "55555555-5555-4555-8555-555555555555";

const SETUP_A = "setup-a";
const SETUP_B = "setup-b";
const SETUP_LAUNCHED = "setup-launched";
const SETUP_READY = "setup-ready";
const SETUP_GAPS = "setup-gaps";

const MANAGER_A = "manager-a";
const MANAGER_B = "manager-b";
const STAFF = "admin-staff";
const STAFF_TWO = "admin-second";
const SERVICE = "service-process";

type Write = { table: string; op: string; payload: any };
let writes: Write[] = [];

const setup = (over: Record<string, unknown>) => ({
  structure: "spv",
  stage: "documents",
  launch_state: "not_ready",
  launched_at: null,
  client_id: "client-1",
  ...over,
});

const condition = (setupId: string, key: string, satisfied: boolean) => ({
  id: `${setupId}-${key}`,
  setup_id: setupId,
  condition_key: key,
  label: key,
  required: true,
  satisfied,
});

const readyConditions = (setupId: string) =>
  [
    "entity_active",
    "documents_current",
    "banking_active",
    "economics_approved",
    "regulatory_reviewed",
    "eligibility_approved",
    "onboarding_configured",
    "blocking_tasks_complete",
    "harmonious_approval",
  ].map((key) => condition(setupId, key, true));

const tables: Record<string, any[]> = {
  user_roles: [
    { user_id: MANAGER_A, role: "fund_manager" },
    { user_id: MANAGER_B, role: "fund_manager" },
    { user_id: STAFF, role: "admin" },
    { user_id: STAFF_TWO, role: "admin" },
    // The service process holds no role at all — it is never an actor.
  ],
  fund_managers: [
    { user_id: MANAGER_A, offering_id: FUND_A },
    { user_id: MANAGER_A, offering_id: FUND_L },
    { user_id: MANAGER_B, offering_id: FUND_B },
  ],
  offerings: [
    { id: FUND_A, slug: "fund-a", name: "Fund A", legal_entity_name: "Fund A LLC" },
    { id: FUND_B, slug: "fund-b", name: "Fund B", legal_entity_name: "Fund B LLC" },
    { id: FUND_L, slug: "fund-l", name: "Fund L", legal_entity_name: "Fund L LLC" },
    { id: FUND_R, slug: "fund-r", name: "Fund R", legal_entity_name: "Fund R LLC" },
    { id: FUND_G, slug: "fund-g", name: "Fund G", legal_entity_name: "Fund G LLC" },
  ],
  fund_setups: [
    setup({ id: SETUP_A, offering_id: FUND_A }),
    setup({ id: SETUP_B, offering_id: FUND_B }),
    setup({
      id: SETUP_LAUNCHED,
      offering_id: FUND_L,
      stage: "investor_onboarding",
      launch_state: "launched",
      launched_at: "2026-02-01T00:00:00Z",
    }),
    setup({
      id: SETUP_READY,
      offering_id: FUND_R,
      stage: "ready_to_launch",
      launch_state: "ready",
    }),
    setup({ id: SETUP_GAPS, offering_id: FUND_G }),
  ],
  fund_setup_tasks: [
    {
      id: "task-harmonious",
      setup_id: SETUP_A,
      section: "offering",
      task_key: "offering_config",
      label: "Offering configuration complete",
      responsible_party: "harmonious",
      client_editable: false,
      status: "in_progress",
      blocking: true,
      dependencies: [],
    },
    {
      id: "task-client",
      setup_id: SETUP_A,
      section: "client",
      task_key: "client_profile",
      label: "Manager / GP details confirmed",
      responsible_party: "client",
      client_editable: true,
      status: "waiting_on_client",
      blocking: true,
      dependencies: [],
    },
    {
      id: "task-gap",
      setup_id: SETUP_GAPS,
      section: "entity",
      task_key: "entity_formation",
      label: "Entity formed and accepted",
      responsible_party: "client_counsel",
      status: "in_progress",
      blocking: true,
      dependencies: [],
    },
  ],
  fund_setup_documents: [
    {
      id: "doc-sub-v1",
      setup_id: SETUP_A,
      doc_type: "subscription_agreement",
      title: "Subscription agreement",
      status: "approved",
      version: 1,
      is_current: true,
      investor_facing: true,
    },
  ],
  fund_entity_formation: [
    {
      id: "entity-a",
      setup_id: SETUP_A,
      step: "formation_requested",
      formation_document_id: null,
      certificate_document_id: null,
      ein_letter_document_id: null,
      entity_identifiers: {},
    },
  ],
  fund_economics_versions: [
    {
      id: "econ-v1",
      setup_id: SETUP_A,
      version: 1,
      status: "approved",
      terms: { managementFeePct: 2 },
      classes: [],
      investor_specific: [],
      prepared_by: STAFF,
      approved_by: STAFF_TWO,
    },
    {
      id: "econ-v2",
      setup_id: SETUP_A,
      version: 2,
      status: "draft",
      terms: { managementFeePct: 1.5 },
      classes: [],
      investor_specific: [],
      prepared_by: STAFF,
    },
  ],
  fund_banking_setups: [
    {
      id: "bank-a",
      setup_id: SETUP_A,
      status: "approved",
      bank_name: "First Republic",
      relationship_contact: "Dana Banker",
      account_reference: "****4321",
      investor_instructions_released: false,
      notes: "internal",
    },
  ],
  fund_regulatory_configs: [
    {
      id: "reg-l-v1",
      setup_id: SETUP_LAUNCHED,
      version: 1,
      status: "reviewed",
      selections: { regD: "506b" },
      locked_at: "2026-02-01T00:00:00Z",
    },
  ],
  fund_eligibility_configs: [],
  fund_onboarding_requirements: [],
  fund_target_assets: [],
  fund_setup_parties: [],
  fund_setup_events: [],
  fund_launch_conditions: [
    ...readyConditions(SETUP_READY),
    ...["entity_active", "banking_active"].map((k) => condition(SETUP_GAPS, k, false)),
  ],
  fund_launch_approvals: [
    {
      id: "approval-ready",
      setup_id: SETUP_READY,
      decision: "approved",
      decided_by: STAFF,
      unmet_conditions: [],
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
  supabaseAdmin: { from: (table: string) => builder(table) },
}));

const server = await import("@/lib/fund-setup.server");
const model = await import("@/lib/fund-setup-model");

beforeEach(() => {
  writes = [];
});

const inserts = (table: string) => writes.filter((w) => w.table === table && w.op === "insert");
const updates = (table: string) => writes.filter((w) => w.table === table && w.op === "update");

describe("fund isolation", () => {
  it("refuses manager A access to fund B's setup", async () => {
    await expect(server.fundSetupDetail(MANAGER_A, SETUP_B)).rejects.toThrow(/Forbidden/);
  });

  it("lets manager A read their own fund's setup", async () => {
    const detail = await server.fundSetupDetail(MANAGER_A, SETUP_A);
    expect(detail.setup.id).toBe(SETUP_A);
    expect(detail.isStaff).toBe(false);
  });

  it("keeps the Fund Administration command center staff-only", async () => {
    await expect(server.fundAdministrationDashboard(MANAGER_A)).rejects.toThrow(/Forbidden/);
    const board = await server.fundAdministrationDashboard(STAFF);
    expect(board.all.length).toBeGreaterThan(0);
  });
});

describe("client-side limits", () => {
  it("does not let a client mark a Harmonious-controlled requirement complete", async () => {
    await expect(
      server.updateTask(MANAGER_A, { taskId: "task-harmonious", status: "complete" }),
    ).rejects.toThrow(/Forbidden/);
  });

  it("does not let a client mark even their own item complete", async () => {
    await expect(
      server.updateTask(MANAGER_A, { taskId: "task-client", status: "complete" }),
    ).rejects.toThrow(/Forbidden/);
  });

  it("lets a client answer their own item and send it for review", async () => {
    await server.updateTask(MANAGER_A, {
      taskId: "task-client",
      status: "review",
      response: { gpName: "Harmonious GP LLC" },
    });
    expect(updates("fund_setup_tasks")[0]?.payload.status).toBe("review");
  });

  it("does not let a client reassign or re-date a task", async () => {
    await expect(
      server.updateTask(MANAGER_A, { taskId: "task-client", dueDate: "2027-01-01" }),
    ).rejects.toThrow(/Forbidden/);
  });

  it("lets Harmonious complete its own requirement", async () => {
    await server.updateTask(STAFF, { taskId: "task-harmonious", status: "complete" });
    const patch = updates("fund_setup_tasks")[0]?.payload;
    expect(patch.status).toBe("complete");
    expect(patch.completed_by).toBe(STAFF);
  });
});

describe("launch gate", () => {
  it("will not approve launch while required setup is unmet", async () => {
    await expect(
      server.decideLaunch(STAFF, { setupId: SETUP_GAPS, decision: "approved" }),
    ).rejects.toThrow(/Required setup is incomplete/);
  });

  it("will not launch a fund that has no approval", async () => {
    await expect(server.launchFund(STAFF, SETUP_GAPS)).rejects.toThrow(/not approved/);
  });

  it("refuses a launch decision from a fund manager", async () => {
    await expect(
      server.decideLaunch(MANAGER_A, { setupId: SETUP_READY, decision: "approved" }),
    ).rejects.toThrow(/Forbidden/);
  });

  it("refuses a launch decision from an unprivileged service process", async () => {
    await expect(
      server.decideLaunch(SERVICE, { setupId: SETUP_READY, decision: "approved" }),
    ).rejects.toThrow(/Forbidden/);
    expect(inserts("fund_launch_approvals")).toHaveLength(0);
  });

  it("records the Harmonious approval against the approver", async () => {
    const result = await server.decideLaunch(STAFF, {
      setupId: SETUP_READY,
      decision: "approved",
    });
    expect(result.decision).toBe("approved");
    expect(inserts("fund_launch_approvals")[0]?.payload.decided_by).toBe(STAFF);
  });

  it("issues an investor URL that resolves only to the intended offering", async () => {
    const launch = await server.launchFund(STAFF, SETUP_READY);
    expect(launch.investorOnboardingUrl).toBe("/invest/fund-r");
    expect(launch.offering.id).toBe(FUND_R);
    expect(model.investorOnboardingPath("fund-r")).not.toBe(model.investorOnboardingPath("fund-a"));
  });
});

describe("document and economics history", () => {
  it("adds a new document version instead of rewriting the old one", async () => {
    const created = await server.saveSetupDocument(STAFF, {
      setupId: SETUP_A,
      docType: "subscription_agreement",
      title: "Subscription agreement (amended)",
    });
    expect(created.version).toBe(2);
    expect(created.supersedes_id).toBe("doc-sub-v1");
    expect(writes.some((w) => w.table === "fund_setup_documents" && w.op === "delete")).toBe(false);
    const priorPatch = updates("fund_setup_documents")[0]?.payload;
    expect(priorPatch.is_current).toBe(false);
    expect(priorPatch.status).toBe("superseded");
  });

  it("preserves approved economics rather than editing them", async () => {
    await expect(
      server.saveEconomics(STAFF, { setupId: SETUP_A, terms: { managementFeePct: 0 }, versionId: "econ-v1" }),
    ).rejects.toThrow(/preserved/);
  });

  it("supersedes the prior approved economics when a new version is approved", async () => {
    await server.approveEconomics(STAFF_TWO, "econ-v2");
    const patches = updates("fund_economics_versions").map((w) => w.payload.status);
    expect(patches).toContain("superseded");
    expect(patches).toContain("approved");
  });

  it("does not let the preparer approve their own economic terms", async () => {
    await expect(server.approveEconomics(STAFF, "econ-v2")).rejects.toThrow(/cannot also approve/);
  });

  it("will not accept an entity step without its supporting document", async () => {
    await expect(
      server.advanceEntityFormation(STAFF, { setupId: SETUP_A, step: "formation_filed" }),
    ).rejects.toThrow(/supporting document/);
  });
});

describe("banking confidentiality", () => {
  it("hides banking detail from a manager until instructions are released", async () => {
    const detail = await server.fundSetupDetail(MANAGER_A, SETUP_A);
    expect(detail.banking?.bank_name).toBeNull();
    expect(detail.banking?.account_reference).toBeNull();
    expect(detail.banking?.notes).toBeNull();
  });

  it("will not release instructions before the account is active", async () => {
    await expect(server.releaseBankingInstructions(STAFF, SETUP_A)).rejects.toThrow(
      /account is active/,
    );
  });

  it("shows released instructions only when the account is active and released", () => {
    const released = server.redactBanking(
      {
        id: "bank-x",
        setup_id: SETUP_A,
        status: "account_active",
        investor_instructions_released: true,
        bank_name: "First Republic",
        account_reference: "****4321",
      },
      false,
    );
    expect(released?.bank_name).toBe("First Republic");
  });
});

describe("regulatory configuration after launch", () => {
  it("refuses a manager's change to a launched fund's regulatory configuration", async () => {
    await expect(
      server.saveRegulatoryConfig(MANAGER_A, {
        setupId: SETUP_LAUNCHED,
        selections: { regD: "506c" },
      }),
    ).rejects.toThrow(/Forbidden/);
  });

  it("requires a stated reason for a post-launch amendment", async () => {
    await expect(
      server.saveRegulatoryConfig(STAFF, {
        setupId: SETUP_LAUNCHED,
        selections: { regD: "506c" },
      }),
    ).rejects.toThrow(/stated reason/);
  });

  it("will not edit a locked configuration in place", async () => {
    await expect(
      server.saveRegulatoryConfig(STAFF, {
        setupId: SETUP_LAUNCHED,
        selections: { regD: "506c" },
        configId: "reg-l-v1",
        amendmentReason: "State filing update",
      }),
    ).rejects.toThrow(/new version/);
  });

  it("accepts a controlled amendment as a new version", async () => {
    const created = await server.saveRegulatoryConfig(STAFF, {
      setupId: SETUP_LAUNCHED,
      selections: { regD: "506c" },
      amendmentReason: "Offering converted to 506(c)",
    });
    expect(created.version).toBe(2);
    expect(created.supersedes_id).toBe("reg-l-v1");
    expect(created.status).toBe("draft");
  });
});
