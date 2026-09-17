import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adversarial authorization tests for the valuation layer.
 *
 * Every id in these tests comes "from the browser": the point is that the
 * server re-reads the record and authorises against the fund it actually
 * belongs to, so substituting an asset, valuation or fund id never crosses a
 * boundary.
 */

const FUND_A = "11111111-1111-4111-8111-111111111111";
const FUND_B = "22222222-2222-4222-8222-222222222222";
const BOOK_A = "bbbb1111-1111-4111-8111-111111111111";
const BOOK_B = "bbbb2222-2222-4222-8222-222222222222";
const ASSET_A = "aaaa1111-1111-4111-8111-111111111111";
const ASSET_B = "aaaa2222-2222-4222-8222-222222222222";
const VAL_A = "cccc1111-1111-4111-8111-111111111111";
const VAL_A_EFFECTIVE = "cccc1111-2222-4222-8222-222222222222";
const VAL_B = "cccc2222-2222-4222-8222-222222222222";

const MANAGER_A = "manager-a";
const MANAGER_B = "manager-b";
const ADMIN = "admin-1";
const INVESTOR = "investor-1";

type Write = { table: string; op: string; payload: any };
let writes: Write[] = [];

const tables: Record<string, any[]> = {
  user_roles: [
    { user_id: MANAGER_A, role: "fund_manager" },
    { user_id: MANAGER_B, role: "fund_manager" },
    { user_id: ADMIN, role: "admin" },
    { user_id: INVESTOR, role: "investor" },
  ],
  fund_managers: [
    { user_id: MANAGER_A, offering_id: FUND_A },
    { user_id: MANAGER_B, offering_id: FUND_B },
  ],
  offerings: [
    { id: FUND_A, name: "Fund A" },
    { id: FUND_B, name: "Fund B" },
  ],
  valuation_policies: [],
  portfolio_assets: [
    {
      id: ASSET_A,
      book_id: BOOK_A,
      offering_id: FUND_A,
      issuer_name: "Acme",
      asset_name: "Series A preferred",
      asset_class: "private_preferred",
      quantity: 100,
      cost_basis_cents: 1_000_000,
      realized_cost_basis_cents: 0,
      status: "active",
    },
    {
      id: ASSET_B,
      book_id: BOOK_B,
      offering_id: FUND_B,
      issuer_name: "Globex",
      asset_name: "Common",
      asset_class: "private_common",
      quantity: 50,
      cost_basis_cents: 500_000,
      realized_cost_basis_cents: 0,
      status: "active",
    },
  ],
  portfolio_valuations: [
    {
      id: VAL_A,
      asset_id: ASSET_A,
      book_id: BOOK_A,
      offering_id: FUND_A,
      version: 2,
      status: "review",
      value_cents: 1_500_000,
      effective_date: "2026-06-30",
      valuation_date: "2026-06-30",
      methodology: "third_party",
      source_type: "independent_third_party",
      source: "Acme Valuations",
      inputs: {},
      conflicts: [],
      change_cents: 500_000,
    },
    {
      id: VAL_A_EFFECTIVE,
      asset_id: ASSET_A,
      book_id: BOOK_A,
      offering_id: FUND_A,
      version: 1,
      status: "effective",
      value_cents: 1_000_000,
      effective_date: "2026-03-31",
      valuation_date: "2026-03-31",
      methodology: "cost",
      source_type: "observable_transaction",
      source: "Purchase",
      inputs: {},
      conflicts: [],
      change_cents: 0,
      journal_entry_id: null,
    },
    {
      id: VAL_B,
      asset_id: ASSET_B,
      book_id: BOOK_B,
      offering_id: FUND_B,
      version: 1,
      status: "review",
      value_cents: 700_000,
      effective_date: "2026-06-30",
      valuation_date: "2026-06-30",
      methodology: "manager_mark",
      source_type: "manager_mark",
      source: "GP view",
      inputs: {},
      conflicts: [],
      change_cents: 200_000,
    },
  ],
  valuation_evidence: [],
  valuation_events: [],
  portfolio_realizations: [],
  chart_of_accounts: [
    { id: "acc-1110", book_id: BOOK_A, code: "1110" },
    { id: "acc-4400", book_id: BOOK_A, code: "4400" },
  ],
};

function builder(table: string) {
  let rows = [...(tables[table] ?? [])];
  const api: any = {
    select: () => api,
    order: () => api,
    limit: () => api,
    not: (col: string, _op: string, val: unknown) => {
      rows = rows.filter((r) => (val === null ? r[col] !== null && r[col] !== undefined : r[col] !== val));
      return api;
    },
    is: () => api,
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
      const created = { id: `new-${table}`, ...payload };
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
    storage: {
      from: () => ({
        createSignedUrl: () =>
          Promise.resolve({ data: { signedUrl: "https://example.test/x" }, error: null }),
      }),
    },
  },
}));

const draftJournalEntry = vi.fn(async () => ({ id: "journal-1" }));
vi.mock("@/lib/accounting.server", () => ({
  draftJournalEntry: (...args: unknown[]) => (draftJournalEntry as any)(...args),
  ledgerBookForOffering: async () => ({ id: BOOK_A }),
}));
vi.mock("@/lib/reconciliation.server", () => ({ raiseException: vi.fn(async () => {}) }));

import {
  decideValuation,
  listPortfolioAssets,
  prepareValuationJournal,
  proposeValuation,
  recordRealization,
  respondToValuation,
  valuationAsOfDate,
  valuationQueue,
} from "./valuation.server";

beforeEach(() => {
  writes = [];
  draftJournalEntry.mockClear();
});

const proposal = {
  valuationDate: "2026-09-30",
  effectiveDate: "2026-09-30",
  valueCents: 2_000_000,
  methodology: "third_party" as const,
  sourceType: "independent_third_party" as const,
  source: "Acme Valuations",
};

describe("fund isolation", () => {
  it("shows Manager A only their own fund's assets", async () => {
    const assets = await listPortfolioAssets(MANAGER_A);
    expect(assets.map((a: any) => a.offering_id)).toEqual([FUND_A]);
  });

  it("refuses Manager A a valuation queue filtered to another fund", async () => {
    await expect(valuationQueue(MANAGER_A, { offeringId: FUND_B })).rejects.toThrow(/do not manage/i);
  });

  it("refuses Manager A proposing a valuation on Fund B's asset", async () => {
    await expect(proposeValuation(MANAGER_A, { assetId: ASSET_B, ...proposal })).rejects.toThrow(
      /do not manage/i,
    );
    expect(writes).toHaveLength(0);
  });

  it("refuses Manager A any decision on Fund B's valuation", async () => {
    await expect(
      decideValuation(MANAGER_A, { valuationId: VAL_B, action: "approve" }),
    ).rejects.toThrow(/do not manage/i);
    await expect(
      respondToValuation(MANAGER_A, { valuationId: VAL_B, response: "acknowledge" }),
    ).rejects.toThrow(/do not manage/i);
    expect(writes).toHaveLength(0);
  });

  it("refuses Manager A an as-of value for an unrelated asset", async () => {
    await expect(valuationAsOfDate(MANAGER_A, ASSET_B, "2026-06-30")).rejects.toThrow(
      /do not manage/i,
    );
  });

  it("refuses investors outright", async () => {
    await expect(listPortfolioAssets(INVESTOR)).rejects.toThrow(/reviewer access/i);
    await expect(proposeValuation(INVESTOR, { assetId: ASSET_A, ...proposal })).rejects.toThrow();
  });
});

describe("who may decide", () => {
  it("lets Manager A propose on their own asset but not approve it", async () => {
    await expect(proposeValuation(MANAGER_A, { assetId: ASSET_A, ...proposal })).resolves.toBeTruthy();
    const inserted = writes.find((w) => w.table === "portfolio_valuations");
    expect(inserted?.payload.status).toBe("draft");
    expect(inserted?.payload.prepared_by_role).toBe("fund_manager");

    await expect(
      decideValuation(MANAGER_A, { valuationId: VAL_A, action: "approve" }),
    ).rejects.toThrow(/only Harmonious/i);
  });

  it("never lets a manager mark a valuation effective, even their own fund's", async () => {
    await expect(
      decideValuation(MANAGER_A, { valuationId: VAL_A, action: "make_effective" }),
    ).rejects.toThrow(/only Harmonious/i);
    await expect(
      decideValuation(MANAGER_B, { valuationId: VAL_A_EFFECTIVE, action: "make_effective" }),
    ).rejects.toThrow(/do not manage/i);
  });

  it("lets Harmonious approve and records who decided", async () => {
    await expect(
      decideValuation(ADMIN, { valuationId: VAL_A, action: "approve" }),
    ).resolves.toMatchObject({ status: "approved" });
    const update = writes.find((w) => w.table === "portfolio_valuations" && w.op === "update");
    expect(update?.payload.approved_by).toBe(ADMIN);
    const event = writes.find((w) => w.table === "valuation_events");
    expect(event?.payload.actor_user_id).toBe(ADMIN);
    expect(event?.payload.actor_role).toBe("harmonious");
  });

  it("requires a reason to return or reject", async () => {
    await expect(
      decideValuation(ADMIN, { valuationId: VAL_A, action: "return", reason: "" }),
    ).rejects.toThrow(/say why/i);
  });

  it("refuses to make an already effective valuation effective again", async () => {
    await expect(
      decideValuation(ADMIN, { valuationId: VAL_A_EFFECTIVE, action: "make_effective" }),
    ).rejects.toThrow(/cannot become effective/i);
  });

  it("refuses to approve straight from review to effective without approval", async () => {
    await expect(
      decideValuation(ADMIN, { valuationId: VAL_A, action: "make_effective" }),
    ).rejects.toThrow(/cannot become effective/i);
  });

  it("keeps the ledger and realisations away from fund managers", async () => {
    await expect(prepareValuationJournal(MANAGER_A, VAL_A_EFFECTIVE)).rejects.toThrow(
      /Harmonious valuation authority/i,
    );
    await expect(
      recordRealization(MANAGER_A, {
        assetId: ASSET_A,
        dispositionDate: "2026-09-30",
        proceedsCents: 100,
      }),
    ).rejects.toThrow(/Harmonious valuation authority/i);
    expect(draftJournalEntry).not.toHaveBeenCalled();
  });
});

describe("ledger handoff", () => {
  it("only takes an effective valuation to the ledger, and only as a draft journal", async () => {
    await expect(prepareValuationJournal(ADMIN, VAL_A)).rejects.toThrow(/effective valuation/i);
    const result = await prepareValuationJournal(ADMIN, VAL_A_EFFECTIVE);
    expect(result.journalEntryId).toBe("journal-1");
    expect(draftJournalEntry).toHaveBeenCalledTimes(1);
    const [, payload] = (draftJournalEntry as any).mock.calls[0];
    expect(payload.sourceTable).toBe("portfolio_valuations");
    // Prepared only — the existing review/approve/post workflow still applies.
    expect(payload.lines).toHaveLength(2);
  });
});

// ------------------------------------------------- database-level guarantees

const migrationSql = readdirSync(join(process.cwd(), "drizzle", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(process.cwd(), "drizzle", "migrations", f), "utf8"))
  .join("\n");

describe("database guarantees", () => {
  it("gives fund managers read-only access to valuation tables", () => {
    for (const table of [
      "portfolio_assets",
      "portfolio_valuations",
      "valuation_evidence",
      "valuation_policies",
      "portfolio_realizations",
    ]) {
      expect(migrationSql).toMatch(
        new RegExp(`create policy "managers read [^"]+" on public\\.${table}\\s+for select`, "i"),
      );
      expect(migrationSql).not.toMatch(
        new RegExp(`on public\\.${table}\\s+for all to authenticated`, "i"),
      );
    }
  });

  it("scopes every manager read to funds they actually manage", () => {
    const matches = migrationSql.match(/create policy "managers read [^"]+" on public\.(portfolio|valuation)[\s\S]*?;/gi) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    for (const policy of matches) {
      expect(policy).toMatch(/private\.manages_offering\(offering_id\)/);
    }
  });

  it("makes effective valuations immutable and history append-only in the database", () => {
    expect(migrationSql).toMatch(/Effective valuations are immutable/);
    expect(migrationSql).toMatch(/Effective valuations cannot be deleted/);
    expect(migrationSql).toMatch(/Evidence for a completed valuation is preserved/);
    expect(migrationSql).toMatch(/Valuation history is append-only/);
  });

  it("allows only one journal per valuation and per disposition", () => {
    expect(migrationSql).toMatch(/portfolio_valuations_journal_unique/);
    expect(migrationSql).toMatch(/portfolio_realizations_journal_unique/);
    expect(migrationSql).toMatch(/portfolio_realizations_bank_unique/);
  });
});
