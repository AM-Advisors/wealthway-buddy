/**
 * Adversarial proofs for the Action Center: scope comes from the reader's own
 * relationship records, never from anything the browser could change, and one
 * delegation can never surface another client's work.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const canActMock = vi.fn();
const adminTables: Record<string, Row[]> = {};

vi.mock("@/lib/delegated-access.server", () => ({
  canAct: (...args: unknown[]) => canActMock(...args),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => builder(table, adminTables) },
}));

type Row = Record<string, any>;

function builder(table: string, store: Record<string, Row[]>) {
  const eqs: Row = {};
  const ins: { column: string; values: any[] }[] = [];
  const api: any = {
    select: () => api,
    order: () => api,
    limit: () => api,
    is: () => api,
    not: () => api,
    neq: (column: string, value: unknown) => {
      eqs[`!${column}`] = value;
      return api;
    },
    eq: (column: string, value: unknown) => {
      eqs[column] = value;
      return api;
    },
    in: (column: string, values: any[]) => {
      ins.push({ column, values });
      return api;
    },
    then: (resolve: any) => {
      const rows = (store[table] ?? []).filter((row) => {
        for (const [key, value] of Object.entries(eqs)) {
          if (key.startsWith("!")) {
            if (row[key.slice(1)] === value) return false;
          } else if (row[key] !== value) return false;
        }
        for (const clause of ins) if (!clause.values.includes(row[clause.column])) return false;
        return true;
      });
      return resolve({ data: rows, error: null });
    },
  };
  return api;
}

const tables: Record<string, Row[]> = {};
const supabase = { from: (table: string) => builder(table, tables) };

async function load() {
  const mod = await import("@/lib/attention.server");
  return mod.attentionFor;
}

function reset() {
  for (const key of Object.keys(tables)) delete tables[key];
  for (const key of Object.keys(adminTables)) delete adminTables[key];
  canActMock.mockReset();
  tables["offerings"] = [{ id: "fund-1", name: "Harmonious SPV I" }];
  tables["clients"] = [{ id: "client-1", name: "Acme Holdings" }];
}

const ctx = (userId: string) => ({ userId, supabase });
const allItems = (result: any) =>
  Object.values(result.groups).flat() as { id: string; sourceId: string; href: string }[];

beforeEach(reset);

describe("investor scope", () => {
  it("returns only the reader's own application", async () => {
    tables["investor_applications"] = [
      { id: "app-a", user_id: "user-a", offering_id: "fund-1", kyc_status: "pending" },
      { id: "app-b", user_id: "user-b", offering_id: "fund-1", kyc_status: "pending" },
    ];
    const attentionFor = await load();
    const result = await attentionFor(ctx("user-a"), "investor");
    const ids = allItems(result).map((i) => i.sourceId);
    expect(ids).toContain("app-a");
    expect(ids).not.toContain("app-b");
  });

  it("returns nothing for a person with no records at all", async () => {
    const attentionFor = await load();
    const result = await attentionFor(ctx("stranger"), "investor");
    expect(allItems(result)).toHaveLength(0);
  });

  it("shows an expired government ID as urgent and carries its real expiry", async () => {
    tables["investor_applications"] = [
      { id: "app-a", user_id: "user-a", offering_id: "fund-1", kyc_status: "approved", aml_status: "approved", accreditation_status: "approved" },
    ];
    tables["kyc_verifications"] = [
      {
        id: "kyc-1",
        application_id: "app-a",
        document_expired: true,
        document_expiration_date: "2025-01-01",
        harmonious_decision: "review_required",
      },
    ];
    const attentionFor = await load();
    const result = await attentionFor(ctx("user-a"), "investor");
    const found = result.groups.needs_you.find((i) => i.sourceTable === "kyc_verifications");
    expect(found?.severity).toBe("critical");
    expect(found?.dueDate).toBe("2025-01-01");
    expect(found?.dueDateSource).toBe("kyc_verifications.document_expiration_date");
  });

  it("never carries a bank or identity number out of the server", async () => {
    tables["investor_applications"] = [
      { id: "app-a", user_id: "user-a", offering_id: "fund-1", kyc_status: "pending" },
    ];
    const attentionFor = await load();
    const result = await attentionFor(ctx("user-a"), "investor");
    for (const item of allItems(result) as any[]) {
      expect(Object.keys(item).join(",")).not.toMatch(/account|routing|ssn|tax_id/i);
      expect(item.href.startsWith("/")).toBe(true);
    }
  });

  it("says tax work is not configured rather than showing an all-clear", async () => {
    const attentionFor = await load();
    const result = await attentionFor(ctx("user-a"), "investor");
    expect(result.gaps.some((g) => /not been configured/i.test(g.message))).toBe(true);
  });
});

describe("fund scope", () => {
  it("shows nothing for a fund the reader does not manage", async () => {
    tables["fund_managers"] = [{ user_id: "other", offering_id: "fund-1" }];
    tables["capital_calls"] = [{ id: "call-1", offering_id: "fund-1", status: "published" }];
    const attentionFor = await load();
    const result = await attentionFor(ctx("manager-a"), "fund_manager");
    expect(allItems(result)).toHaveLength(0);
  });

  it("shows only funds named in the reader's own manager records", async () => {
    tables["offerings"] = [
      { id: "fund-1", name: "Fund One" },
      { id: "fund-2", name: "Fund Two" },
    ];
    tables["fund_managers"] = [{ user_id: "manager-a", offering_id: "fund-1" }];
    tables["capital_calls"] = [
      { id: "call-1", offering_id: "fund-1", status: "published" },
      { id: "call-2", offering_id: "fund-2", status: "published" },
    ];
    const attentionFor = await load();
    const result = await attentionFor(ctx("manager-a"), "fund_manager");
    const ids = allItems(result).map((i) => i.sourceId);
    expect(ids).toEqual(["call-1"]);
  });
});

describe("company scope", () => {
  it("ignores a revoked cap-table seat", async () => {
    tables["cap_holder_access"] = [
      { user_id: "founder-a", client_id: "client-1", revoked_at: "2026-01-01T00:00:00Z" },
    ];
    tables["invoices"] = [{ id: "inv-1", client_id: "client-1", status: "issued" }];
    const attentionFor = await load();
    const result = await attentionFor(ctx("founder-a"), "company");
    expect(allItems(result)).toHaveLength(0);
  });

  it("shows the client's own invoice for a live membership", async () => {
    tables["client_users"] = [{ user_id: "founder-a", client_id: "client-1" }];
    tables["invoices"] = [
      { id: "inv-1", client_id: "client-1", status: "issued" },
      { id: "inv-2", client_id: "client-9", status: "issued" },
    ];
    const attentionFor = await load();
    const result = await attentionFor(ctx("founder-a"), "company");
    expect(allItems(result).map((i) => i.sourceId)).toEqual(["inv-1"]);
  });
});

describe("delegated scope", () => {
  const delegation = (over: Row = {}) => ({
    id: "del-1",
    principal_user_id: "client-user",
    delegate_user_id: "pro-a",
    status: "active",
    acceptance_state: "accepted",
    ...over,
  });

  it("shows nothing when the delegation permission check denies", async () => {
    tables["delegations"] = [delegation()];
    adminTables["investor_applications"] = [
      { id: "app-c", user_id: "client-user", kyc_status: "pending" },
    ];
    canActMock.mockResolvedValue({ allowed: false, reason: "No live delegation covers this." });
    const attentionFor = await load();
    const result = await attentionFor(ctx("pro-a"), "professional");
    expect(allItems(result)).toHaveLength(0);
  });

  it("shows nothing for a revoked delegation", async () => {
    tables["delegations"] = [delegation({ status: "revoked" })];
    canActMock.mockResolvedValue({ allowed: true, delegationId: "del-1" });
    const attentionFor = await load();
    const result = await attentionFor(ctx("pro-a"), "professional");
    expect(allItems(result)).toHaveLength(0);
    expect(canActMock).not.toHaveBeenCalled();
  });

  it("tags each item with the delegation that authorised it", async () => {
    tables["delegations"] = [delegation()];
    adminTables["profiles"] = [{ user_id: "client-user", legal_name: "Client Person" }];
    adminTables["investor_applications"] = [
      { id: "app-c", user_id: "client-user", kyc_status: "pending" },
    ];
    canActMock.mockResolvedValue({ allowed: true, delegationId: "del-1" });
    const attentionFor = await load();
    const result = await attentionFor(ctx("pro-a"), "professional");
    const items = allItems(result) as any[];
    expect(items).toHaveLength(1);
    expect(items[0].delegationId).toBe("del-1");
    expect(items[0].onBehalfOf).toBe("Client Person");
  });

  it("refuses an item when the permission was granted under a different delegation", async () => {
    tables["delegations"] = [delegation()];
    adminTables["investor_applications"] = [
      { id: "app-c", user_id: "client-user", kyc_status: "pending" },
    ];
    canActMock.mockResolvedValue({ allowed: true, delegationId: "del-other" });
    const attentionFor = await load();
    const result = await attentionFor(ctx("pro-a"), "professional");
    expect(allItems(result)).toHaveLength(0);
  });

  it("surfaces an invitation still awaiting acceptance without reading client data", async () => {
    tables["delegations"] = [delegation({ acceptance_state: "pending", status: "pending" })];
    const attentionFor = await load();
    const result = await attentionFor(ctx("pro-a"), "professional");
    expect(result.groups.needs_you.map((i) => i.source)).toEqual(["professional.acceptance"]);
    expect(canActMock).not.toHaveBeenCalled();
  });
});

describe("operations", () => {
  it("does not duplicate the Operations work queue", async () => {
    const attentionFor = await load();
    const result = await attentionFor(ctx("staff-a"), "operations");
    expect(allItems(result)).toHaveLength(0);
    expect(result.gaps[0]?.message).toMatch(/Operations work queue/);
  });
});
