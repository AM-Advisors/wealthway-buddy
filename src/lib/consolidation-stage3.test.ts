/**
 * Consolidation Stage 3 — Action Center completion (company Home) and
 * authorization-semantics parity.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { companyFeeProposalItems, companyInvoiceItems } from "@/lib/company-actions";
import {
  adminAccessProjection,
  attentionWorkspaces,
  delegationFact,
  operationsAccessProjection,
  professionalStandingProjection,
  staffFactsFromRoles,
  type CanonicalFacts,
} from "@/lib/session-facts.server";
import { can, OPS_AREAS, OPS_STAFF_ROLES } from "@/lib/ops-capabilities";
import { emptyFacts } from "@/lib/session-resolution";

vi.mock("@/lib/delegated-access.server", () => ({ canAct: vi.fn(async () => ({ allowed: false })) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => ({}) } }));

/* ------------------------------------------------------------------ fixtures */

type Row = Record<string, any>;
const tables: Record<string, Row[]> = {};
function builder(table: string) {
  const eqs: Row = {};
  const ins: { c: string; v: any[] }[] = [];
  const api: any = {
    select: () => api,
    order: () => api,
    limit: () => api,
    is: () => api,
    neq: () => api,
    eq: (c: string, v: unknown) => ((eqs[c] = v), api),
    in: (c: string, v: any[]) => (ins.push({ c, v }), api),
    then: (resolve: any) =>
      resolve({
        data: (tables[table] ?? []).filter(
          (r) => Object.entries(eqs).every(([k, v]) => r[k] === v) && ins.every((i) => i.v.includes(r[i.c])),
        ),
        error: null,
      }),
  };
  return api;
}
const supabase = { from: (t: string) => builder(t) };

const today = new Date().toISOString().slice(0, 10);
const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
const INVOICES: Row[] = [
  { id: "inv-issued", client_id: "c1", status: "issued", number: "H-1", due_date: "2099-01-01", client_approved_at: null, updated_at: recent },
  { id: "inv-approved", client_id: "c1", status: "approved", number: "H-2", due_date: null, client_approved_at: recent, updated_at: recent },
  { id: "inv-issued-approved", client_id: "c1", status: "issued", number: "H-3", client_approved_at: recent, updated_at: recent },
  { id: "inv-partial", client_id: "c1", status: "partially_paid", number: "H-4", updated_at: recent },
  { id: "inv-overdue", client_id: "c1", status: "overdue", number: "H-5", due_date: "2020-01-01", updated_at: recent },
  { id: "inv-paid", client_id: "c1", status: "paid", number: "H-6", updated_at: recent },
  { id: "inv-draft", client_id: "c1", status: "draft", number: "H-7", updated_at: recent },
  { id: "inv-other", client_id: "c2", status: "issued", number: "X-1", updated_at: recent },
];
const REQUESTS: Row[] = [
  { id: "req-quoted", client_id: "c1", service_key: "tax_prep", status: "quoted", updated_at: recent },
  { id: "req-requested", client_id: "c1", service_key: "tax_prep", status: "requested", updated_at: recent },
  { id: "req-signed", client_id: "c1", service_key: "tax_prep", status: "signed", updated_at: recent },
  { id: "req-activated", client_id: "c1", service_key: "tax_prep", status: "activated", updated_at: recent },
  { id: "req-other", client_id: "c2", service_key: "tax_prep", status: "quoted", updated_at: recent },
];

/** The company Home "Needs you" calculation exactly as it stood before Stage 3. */
function legacyCompanyNeedsYou(invoices: Row[], serviceRequests: Row[]) {
  const OPEN_INVOICES = ["issued", "approved", "partially_paid", "overdue"];
  const openInvoices = invoices.filter((i) => OPEN_INVOICES.includes(i.status));
  const openRequests = serviceRequests.filter((r) => ["requested", "in_review", "quoted", "signed"].includes(r.status));
  return [
    ...openInvoices.map((inv) => {
      const due = inv.due_date ? String(inv.due_date).slice(0, 10) : null;
      const approved = Boolean(inv.client_approved_at || inv.status === "approved");
      return {
        sourceId: inv.id as string,
        verb: approved ? "Pay" : "Approve",
        urgency: due && due < today ? "overdue" : due ? "soon" : "open",
      };
    }),
    ...openRequests.filter((r) => r.status === "quoted").map((r) => ({ sourceId: r.id as string, verb: "Sign", urgency: "soon" })),
  ];
}

const clientName = (id: string | null) => (id === "c1" ? "Acme" : id === "c2" ? "Other Co" : null);
const svc = () => "Tax preparation";

/* ------------------------------------------------------- A/C: company parity */

describe("company Home parity — legacy list vs Action Center", () => {
  const scoped = (rows: Row[]) => rows.filter((r) => r.client_id === "c1");
  const legacy = legacyCompanyNeedsYou(scoped(INVOICES), scoped(REQUESTS));
  const action = [
    ...companyInvoiceItems(scoped(INVOICES) as any, clientName),
    ...companyFeeProposalItems(scoped(REQUESTS) as any, svc, clientName),
  ];
  const needs = action.filter((i) => i.group === "needs_you");

  it("produces exactly the same set of actions", () => {
    expect(needs.map((i) => i.sourceId).sort()).toEqual(legacy.map((l) => l.sourceId).sort());
  });

  it("keeps the same verb for every action (approve / pay / sign)", () => {
    for (const l of legacy) {
      const item = needs.find((i) => i.sourceId === l.sourceId)!;
      expect(item.title.startsWith(l.verb)).toBe(true);
    }
  });

  it("invoice awaiting client action is 'Approve'", () => {
    expect(needs.find((i) => i.sourceId === "inv-issued")?.title).toBe("Approve invoice H-1");
  });

  it("approved invoice awaiting payment is 'Pay', from invoices.status / client_approved_at only", () => {
    const a = needs.find((i) => i.sourceId === "inv-approved")!;
    const b = needs.find((i) => i.sourceId === "inv-issued-approved")!;
    expect(a.title).toBe("Pay invoice H-2");
    expect(a.source).toBe("company.invoice_payment");
    expect(b.title).toBe("Pay invoice H-3");
    expect(b.workflowState).toBe("client_approved");
  });

  it("fee proposal awaiting signature is a needs-you item", () => {
    const f = needs.find((i) => i.sourceId === "req-quoted")!;
    expect(f.title).toBe("Sign the fee proposal for Tax preparation");
    expect(f.sourceTable).toBe("service_requests");
  });

  it("completed items are never 'needs you'", () => {
    expect(needs.map((i) => i.sourceId)).not.toContain("inv-paid");
    expect(needs.map((i) => i.sourceId)).not.toContain("req-activated");
    const done = action.filter((i) => i.group === "recently_completed").map((i) => i.sourceId);
    expect(done).toEqual(expect.arrayContaining(["inv-paid", "req-activated"]));
  });

  it("Harmonious-side work is 'Harmonious is working on it'", () => {
    const working = action.filter((i) => i.group === "harmonious_working").map((i) => i.sourceId);
    expect(working).toEqual(expect.arrayContaining(["req-requested", "req-signed"]));
  });

  it("drafts are invisible", () => {
    expect(action.map((i) => i.sourceId)).not.toContain("inv-draft");
  });

  it("invents no due dates — only invoices.due_date", () => {
    for (const i of action) {
      if (i.dueDate) expect(i.dueDateSource).toBe("invoices.due_date");
      else expect(i.dueDateSource).toBeNull();
    }
    expect(action.find((i) => i.sourceId === "req-quoted")?.dueDate).toBeNull();
    expect(action.find((i) => i.sourceId === "inv-approved")?.dueDate).toBeNull();
  });

  it("the company Home no longer calculates its own to-do list", () => {
    const src = readFileSync(join(process.cwd(), "src/components/client-dashboard.tsx"), "utf8");
    expect(src).not.toMatch(/NeedsYou|needsYou/);
  });
});

describe("company Action Center scope (server read model)", () => {
  beforeEach(() => {
    for (const k of Object.keys(tables)) delete tables[k];
    tables["invoices"] = INVOICES;
    tables["service_requests"] = REQUESTS;
    tables["clients"] = [
      { id: "c1", name: "Acme" },
      { id: "c2", name: "Other Co" },
    ];
    tables["service_catalog"] = [{ key: "tax_prep", name: "Tax preparation" }];
  });
  const load = async (userId: string) => {
    const { attentionFor } = await import("@/lib/attention.server");
    const r = await attentionFor({ userId, supabase }, "company");
    return Object.values(r.groups).flat().map((i: any) => i.sourceId as string);
  };

  it("never includes another company's items", async () => {
    tables["client_users"] = [{ user_id: "u1", client_id: "c1" }];
    const ids = await load("u1");
    expect(ids).toContain("inv-issued");
    expect(ids).not.toContain("inv-other");
    expect(ids).not.toContain("req-other");
  });

  it("an unrelated user gets nothing", async () => {
    tables["client_users"] = [{ user_id: "u1", client_id: "c1" }];
    expect(await load("stranger")).toHaveLength(0);
  });

  it("a multi-company member sees both companies, each labelled", async () => {
    tables["client_users"] = [
      { user_id: "u2", client_id: "c1" },
      { user_id: "u2", client_id: "c2" },
    ];
    const ids = await load("u2");
    expect(ids).toEqual(expect.arrayContaining(["inv-issued", "inv-other", "req-other"]));
  });

  it("cap-table-only access does not surface billing or fee proposals", async () => {
    tables["cap_holder_access"] = [{ user_id: "holder", client_id: "c1", revoked_at: null }];
    const ids = await load("holder");
    expect(ids.some((id) => id.startsWith("inv-") || id.startsWith("req-"))).toBe(false);
  });
});

/* ------------------------------------------------- E: getOperationsAccess */

describe("Operations semantics — every staff role", () => {
  const ROLES = [...OPS_STAFF_ROLES];

  it("the canonical rule is active staff assignment + granular capability", () => {
    for (const role of ROLES) {
      const f = staffFactsFromRoles([role]);
      expect(f.operationsEntry).toBe(true);
      // Each area is reachable only where the role's grants say so.
      for (const area of OPS_AREAS) {
        expect(can(f.capabilities, area, "see")).toBe(f.capabilities.includes(`${area}:see` as any));
      }
    }
  });

  it("finance reaches capital/accounting but not tax, regulatory or administration", () => {
    const c = staffFactsFromRoles(["finance"]).capabilities;
    expect(can(c, "capital", "execute")).toBe(true);
    expect(can(c, "accounting", "approve")).toBe(true);
    expect(can(c, "tax", "see")).toBe(false);
    expect(can(c, "regulatory", "see")).toBe(false);
    expect(can(c, "administration", "see")).toBe(false);
  });

  it("compliance reviews onboarding but cannot move money or prepare accounting", () => {
    const c = staffFactsFromRoles(["compliance"]).capabilities;
    expect(can(c, "onboarding", "approve")).toBe(true);
    expect(can(c, "capital", "see")).toBe(false);
    expect(can(c, "accounting", "see")).toBe(false);
  });

  it("'accounting' is an area, not a role — nobody gets it from a role called accounting", () => {
    const f = staffFactsFromRoles(["accounting"]);
    expect(f.operationsEntry).toBe(false);
    expect(f.capabilities).toHaveLength(0);
  });

  it("operations role cannot approve or execute money", () => {
    const c = staffFactsFromRoles(["operations"]).capabilities;
    expect(can(c, "capital", "approve")).toBe(false);
    expect(can(c, "capital", "execute")).toBe(false);
  });

  it("no staff role (e.g. fund_manager, investor) means no Operations at all", () => {
    for (const roles of [[], ["fund_manager"], ["user"], ["moderator"]]) {
      const f = staffFactsFromRoles(roles);
      expect(f.operationsEntry).toBe(false);
      expect(f.capabilities).toHaveLength(0);
    }
  });

  it("deactivated staff (role row removed) lose everything on the next read", () => {
    expect(staffFactsFromRoles([]).capabilities).toHaveLength(0);
    expect(operationsAccessProjection(staffFactsFromRoles([])).allowed).toBe(false);
  });

  it("an ordinary @harmonious.co user with no role record gets nothing", () => {
    const f = { ...emptyFacts(), email: "someone@harmonious.co", roles: [], operations: staffFactsFromRoles([]) };
    expect(f.operations.operationsEntry).toBe(false);
  });

  it("legacy getOperationsAccess stays admin/operations-only (never broader than canonical)", () => {
    for (const role of ROLES) {
      const legacy = operationsAccessProjection(staffFactsFromRoles([role])).allowed;
      expect(legacy).toBe(role === "admin" || role === "operations");
      if (legacy) expect(staffFactsFromRoles([role]).operationsEntry).toBe(true);
    }
  });
});

/* ------------------------------------------------------ F: getAdminAccess */

const facts = (over: Partial<CanonicalFacts>): CanonicalFacts =>
  ({
    ...emptyFacts(),
    userId: "u",
    email: "",
    name: "",
    roles: [],
    operations: staffFactsFromRoles([]),
    investorPositionIds: [],
    professionalMemberships: [],
    delegations: [],
    ...over,
  }) as CanonicalFacts;

describe("fund-manager semantics — role is descriptive, relationships give scope", () => {
  it("fund_manager role alone yields no fund scope", () => {
    const p = adminAccessProjection(facts({ roles: ["fund_manager"], managedFundIds: [] }));
    expect(p.isFundManager).toBe(true);
    expect(p.offeringIds).toEqual([]);
  });

  it("fund scope is exactly the fund_managers relationships", () => {
    const p = adminAccessProjection(facts({ roles: ["fund_manager"], managedFundIds: ["f1"] }));
    expect(p.offeringIds).toEqual(["f1"]);
  });

  it("a fund_managers relationship without the role never widens legacy reviewer status", () => {
    const p = adminAccessProjection(facts({ roles: [], managedFundIds: ["f1"] }));
    expect(p.isReviewer).toBe(false);
  });

  it("the fund-manager workspace comes from relationships, not the role", () => {
    expect(attentionWorkspaces(facts({ roles: ["fund_manager"], managedFundIds: [] }))).not.toContain("fund_manager");
    expect(attentionWorkspaces(facts({ roles: [], managedFundIds: ["f1"] }))).toContain("fund_manager");
  });

  it("database: managers read applications only through manages_offering (fund_managers)", () => {
    const sql = readdirSync(join(process.cwd(), "supabase/migrations"))
      .map((f) => readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8"))
      .join("\n");
    expect(sql).toMatch(/manages_offering/);
  });
});

/* ----------------------------------------------- G: getProfessionalStanding */

const HOUR = 3_600_000;
const del = (over: Row) =>
  delegationFact({
    id: over["id"] ?? "d",
    principal_user_id: "client-a",
    status: "active",
    acceptance_state: "not_required",
    effective_at: new Date(Date.now() - HOUR).toISOString(),
    expires_at: null,
    revoked_at: null,
    ...over,
  });

describe("professional standing vs authority", () => {
  it("an awaiting-acceptance delegation gives standing (to accept) but no usable authority", () => {
    const s = professionalStandingProjection(facts({ delegations: [del({ acceptance_state: "awaiting_acceptance" })] }));
    expect(s.isProfessional).toBe(true);
    expect(s.usableDelegations).toBe(0);
    expect(s.awaitingAcceptance).toBe(1);
  });

  it("expired / revoked / future delegations still marked active give no standing", () => {
    for (const d of [
      del({ expires_at: new Date(Date.now() - HOUR).toISOString() }),
      del({ revoked_at: new Date().toISOString() }),
      del({ effective_at: new Date(Date.now() + HOUR).toISOString() }),
    ]) {
      expect(d.current).toBe(false);
      expect(d.usable).toBe(false);
      expect(professionalStandingProjection(facts({ delegations: [d] })).isProfessional).toBe(false);
    }
  });

  it("an active firm seat gives standing with no client authority at all", () => {
    const s = professionalStandingProjection(
      facts({
        professionalMemberships: [
          { id: "m", organizationId: "o", organizationName: null, organizationType: null, seatRole: "member", status: "active" },
        ],
      }),
    );
    expect(s.isProfessional).toBe(true);
    expect(s.usableDelegations).toBe(0);
  });

  it("an accepted delegation is usable", () => {
    expect(del({ acceptance_state: "accepted" }).usable).toBe(true);
  });
});

/* ----------------------------------------------- H/I: canAct + DB helpers */

describe("canAct agrees with Stage 1 delegation facts", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/delegated-access.server.ts"), "utf8");
  it("checks status, revocation, effective date, expiry and acceptance", () => {
    for (const probe of ['row.status !== "active"', "row.revoked_at", "row.effective_at", "row.expires_at", "acceptance_state"]) {
      expect(src).toContain(probe);
    }
  });
});

/** Latest definition of a SQL function across the migration history. */
function latestRoleList(fn: string): string[] | null {
  const dir = join(process.cwd(), "supabase/migrations");
  const files = readdirSync(dir).sort();
  let found: string | null = null;
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8");
    const re = new RegExp(`FUNCTION\\s+(?:public|private)\\.${fn}\\s*\\([\\s\\S]*?IN\\s*\\(([^)]*)\\)`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) found = m[1]!;
  }
  if (!found) return null;
  return [...found.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!).sort();
}

describe("database helpers agree with the application's intended staff semantics", () => {
  const staff = [...OPS_STAFF_ROLES].sort();

  it("is_any_staff recognizes exactly the ten staff roles the resolver uses", () => {
    const list = latestRoleList("is_any_staff");
    if (list) expect(list).toEqual(staff);
  });

  it("ct_is_staff is a subset of the staff roles (narrower by design)", () => {
    const list = latestRoleList("ct_is_staff");
    if (list) for (const r of list) expect(staff).toContain(r);
  });

  it("can_review_operations matches the legacy admin/operations projection", () => {
    const list = latestRoleList("can_review_operations");
    if (list) expect(list).toEqual(["admin", "operations"]);
  });

  it("no helper recognizes fund_manager as staff", () => {
    for (const fn of ["is_any_staff", "ct_is_staff", "can_review_operations", "is_staff"]) {
      expect(latestRoleList(fn) ?? []).not.toContain("fund_manager");
    }
  });
});
