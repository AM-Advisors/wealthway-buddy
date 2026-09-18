import { describe, expect, it } from "vitest";

import {
  balanceSheet,
  blockingExceptions,
  canTransitionFinancialReport,
  canTransitionWorkpaper,
  cashFlowStatement,
  changesInCapital,
  classifyCashFlow,
  closeBlockers,
  comparableMapping,
  DEFAULT_MAPPING,
  incomeStatement,
  investorMaySee,
  mapAccount,
  mayViewReport,
  missingStatementProvenance,
  navTieRequired,
  priorPeriodBounds,
  publicationBlockers,
  reportingExceptions,
  scheduleOfInvestments,
  segregationError,
  trialBalance,
  unmappedAccounts,
  workpaperSignoffError,
  type AccountBalance,
  type ChecklistItem,
  type StatementMapping,
} from "@/lib/financial-reporting-model";

const account = (over: Partial<AccountBalance> & Pick<AccountBalance, "code" | "accountType" | "subtype">) =>
  ({
    accountId: `acct-${over.code}`,
    name: over.code,
    openingDebitCents: 0,
    openingCreditCents: 0,
    debitCents: 0,
    creditCents: 0,
    ...over,
  }) as AccountBalance;

/** A tiny but complete fund: cash + one investment, capital, and a fee. */
const BOOKS: AccountBalance[] = [
  account({
    code: "1000",
    accountType: "asset",
    subtype: "cash",
    openingDebitCents: 1_000_000,
    debitCents: 500_000,
    creditCents: 20_000,
  }),
  account({ code: "1100", accountType: "asset", subtype: "investments", openingDebitCents: 400_000 }),
  account({
    code: "3100",
    accountType: "equity",
    subtype: "contribution",
    openingCreditCents: 1_400_000,
    creditCents: 500_000,
  }),
  account({ code: "5000", accountType: "expense", subtype: "management_fee", debitCents: 20_000 }),
];

describe("statement mapping", () => {
  it("places accounts by code, then subtype, then type", () => {
    const mapping: StatementMapping = {
      version: 7,
      basis: "accrual",
      lines: [
        {
          statement: "balance_sheet",
          section: "assets",
          key: "special_cash",
          label: "Restricted cash",
          order: 1,
          match: { codes: ["1000"] },
        },
        ...DEFAULT_MAPPING.lines,
      ],
    };
    const cash = mapAccount(
      { accountId: "a", code: "1000", name: "Cash", accountType: "asset", subtype: "cash" },
      mapping,
      "balance_sheet",
    );
    expect(cash?.key).toBe("special_cash");
    const receivable = mapAccount(
      { accountId: "b", code: "1200", name: "Subs", accountType: "asset", subtype: "receivable" },
      mapping,
      "balance_sheet",
    );
    expect(receivable?.key).toBe("receivables");
  });

  it("names accounts no mapping can place", () => {
    const empty: StatementMapping = { version: 2, basis: "accrual", lines: [] };
    const unmapped = unmappedAccounts(
      [{ accountId: "a", code: "1000", name: "Cash", accountType: "asset", subtype: "cash" }],
      empty,
    );
    expect(unmapped).toHaveLength(1);
  });

  it("keeps an old statement intact when the mapping changes later", () => {
    const before = balanceSheet("2026-03-31", BOOKS, DEFAULT_MAPPING);
    const changed: StatementMapping = {
      version: 2,
      basis: "accrual",
      lines: DEFAULT_MAPPING.lines.map((l) =>
        l.key === "cash" ? { ...l, label: "Bank balances" } : l,
      ),
    };
    const after = balanceSheet("2026-03-31", BOOKS, changed);
    expect(before.lines.find((l) => l.key === "cash")?.label).toBe("Cash and cash equivalents");
    expect(after.lines.find((l) => l.key === "cash")?.label).toBe("Bank balances");
    expect(before.mappingVersion).toBe(1);
    expect(after.mappingVersion).toBe(2);
  });

  it("refuses to compare two periods built on different mappings", () => {
    expect(comparableMapping(2, 2)).toBe(true);
    expect(comparableMapping(2, 1)).toBe(false);
    expect(comparableMapping(2, null)).toBe(false);
  });
});

describe("trial balance", () => {
  it("balances debits against credits", () => {
    const tb = trialBalance("2026-03-31", BOOKS);
    expect(tb.totalDebitCents).toBe(tb.totalCreditCents);
    expect(tb.balanced).toBe(true);
    expect(tb.differenceCents).toBe(0);
  });

  it("reports the exact imbalance when a book is out", () => {
    const broken = [...BOOKS, account({ code: "9999", accountType: "asset", subtype: "other", debitCents: 700 })];
    const tb = trialBalance("2026-03-31", broken);
    expect(tb.balanced).toBe(false);
    expect(tb.differenceCents).toBe(700);
  });

  it("shows opening, activity and ending for each account", () => {
    const cash = trialBalance("2026-03-31", BOOKS).rows.find((r) => r.code === "1000")!;
    expect(cash.openingCents).toBe(1_000_000);
    expect(cash.debitCents).toBe(500_000);
    expect(cash.endingCents).toBe(1_480_000);
  });
});

describe("balance sheet", () => {
  it("balances assets less liabilities against capital and operations", () => {
    const ops = incomeStatement("2026-01-01", "2026-03-31", BOOKS, DEFAULT_MAPPING);
    const bs = balanceSheet("2026-03-31", BOOKS, DEFAULT_MAPPING, ops.netIncreaseCents);
    expect(bs.totalAssetsCents).toBe(1_880_000);
    expect(bs.netAssetsCents).toBe(1_880_000);
    expect(bs.balances).toBe(true);
  });
});

describe("statement of operations", () => {
  it("uses period activity only, never opening balances", () => {
    const ops = incomeStatement("2026-01-01", "2026-03-31", BOOKS, DEFAULT_MAPPING);
    expect(ops.totalExpensesCents).toBe(20_000);
    expect(ops.totalIncomeCents).toBe(0);
    expect(ops.netInvestmentIncomeCents).toBe(-20_000);
    expect(ops.netIncreaseCents).toBe(-20_000);
  });
});

describe("changes in capital", () => {
  it("rolls beginning capital forward to ending capital", () => {
    const capital = changesInCapital({
      beginningCents: 1_400_000,
      contributionsCents: 500_000,
      distributionsCents: 0,
      netOperationsCents: -20_000,
      otherActivityCents: 0,
    });
    expect(capital.endingCents).toBe(1_880_000);
  });
});

describe("cash flow", () => {
  it("classifies movements by what the cash moved against", () => {
    expect(classifyCashFlow("investments")).toBe("investing");
    expect(classifyCashFlow("contribution")).toBe("financing");
    expect(classifyCashFlow("management_fee")).toBe("operating");
  });

  it("reconciles opening cash plus movements to closing cash", () => {
    const cf = cashFlowStatement(
      "2026-01-01",
      "2026-03-31",
      [
        { entryId: "e1", entryDate: "2026-01-05", amountCents: 500_000, counterSubtype: "contribution" },
        { entryId: "e2", entryDate: "2026-02-05", amountCents: -20_000, counterSubtype: "management_fee" },
      ],
      1_000_000,
      1_480_000,
    );
    expect(cf.netChangeCents).toBe(480_000);
    expect(cf.reconciles).toBe(true);
    expect(cf.sections.find((s) => s.section === "financing")?.amountCents).toBe(500_000);
  });
});

describe("schedule of investments", () => {
  const holding = {
    assetId: "asset-1",
    issuer: "Acme",
    instrument: "Preferred",
    assetClass: "private_equity",
    acquisitionDate: "2025-01-01",
    quantity: 100,
    ownershipPct: 5,
    costBasisCents: 400_000,
    fairValueCents: 600_000,
    valuationId: "val-1",
    valuationVersion: 3,
    valuationDate: "2026-03-31",
    methodology: "market_comparable",
  };

  it("shows cost, fair value, unrealised gain and share of NAV", () => {
    const schedule = scheduleOfInvestments("2026-03-31", [holding], 1_200_000);
    expect(schedule.rows[0]!.unrealizedGainCents).toBe(200_000);
    expect(schedule.rows[0]!.pctOfNav).toBe(50);
    expect(schedule.totalFairValueCents).toBe(600_000);
  });

  it("never uses a valuation made effective after the reporting date", () => {
    expect(() =>
      scheduleOfInvestments("2026-03-31", [{ ...holding, valuationDate: "2026-06-30" }], 1_200_000),
    ).toThrow(/after the 2026-03-31 reporting date/);
  });
});

describe("reporting exceptions", () => {
  const baseline = () => {
    const ops = incomeStatement("2026-01-01", "2026-03-31", BOOKS, DEFAULT_MAPPING);
    const bs = balanceSheet("2026-03-31", BOOKS, DEFAULT_MAPPING, ops.netIncreaseCents);
    return {
      basis: "accrual" as const,
      trialBalance: trialBalance("2026-03-31", BOOKS),
      balanceSheet: bs,
      capital: changesInCapital({
        beginningCents: 1_400_000,
        contributionsCents: 500_000,
        distributionsCents: 0,
        netOperationsCents: ops.netIncreaseCents,
        otherActivityCents: 0,
      }),
      navNetAssetsCents: 1_880_000,
      navStatus: "approved",
      investorCapitalTotalCents: 1_880_000,
      allocationStatus: "finalized",
      periodStatus: "closed",
      unmapped: [],
    };
  };

  it("passes a clean period", () => {
    expect(blockingExceptions(reportingExceptions(baseline()))).toEqual([]);
  });

  it("blocks when net assets do not match the approved NAV", () => {
    const kinds = reportingExceptions({ ...baseline(), navNetAssetsCents: 1_879_999 }).map((e) => e.kind);
    expect(kinds).toContain("nav_mismatch");
  });

  it("blocks when there is no approved NAV on an accrual basis", () => {
    const kinds = reportingExceptions({ ...baseline(), navNetAssetsCents: null }).map((e) => e.kind);
    expect(kinds).toContain("nav_not_approved");
    expect(navTieRequired("cash")).toBe(false);
  });

  it("blocks when capital does not tie to investor capital accounts", () => {
    const kinds = reportingExceptions({ ...baseline(), investorCapitalTotalCents: 1_000 }).map(
      (e) => e.kind,
    );
    expect(kinds).toContain("capital_mismatch");
  });

  it("blocks when allocations are not finalized", () => {
    const kinds = reportingExceptions({ ...baseline(), investorCapitalTotalCents: null }).map(
      (e) => e.kind,
    );
    expect(kinds).toContain("allocations_not_finalized");
  });

  it("warns, but does not block, when the period is still open", () => {
    const exceptions = reportingExceptions({ ...baseline(), periodStatus: "review" });
    expect(exceptions.find((e) => e.kind === "period_not_closed")?.severity).toBe("warning");
    expect(blockingExceptions(exceptions)).toEqual([]);
  });
});

describe("report lifecycle", () => {
  it("walks draft to published in order", () => {
    expect(canTransitionFinancialReport("draft", "prepared")).toBe(true);
    expect(canTransitionFinancialReport("prepared", "review")).toBe(true);
    expect(canTransitionFinancialReport("review", "approved")).toBe(true);
    expect(canTransitionFinancialReport("approved", "published")).toBe(true);
  });

  it("never rewrites or reopens a published report", () => {
    expect(canTransitionFinancialReport("published", "approved")).toBe(false);
    expect(canTransitionFinancialReport("published", "draft")).toBe(false);
    expect(canTransitionFinancialReport("published", "superseded")).toBe(true);
    expect(canTransitionFinancialReport("superseded", "published")).toBe(false);
  });

  it("keeps the preparer out of the review and approval seats", () => {
    const actors = { preparedBy: "amy", reviewedBy: null, approvedBy: null, publishedBy: null };
    expect(segregationError(actors, "review", "amy")).toMatch(/other than its preparer/);
    expect(segregationError(actors, "approve", "amy")).toMatch(/other than its preparer/);
    expect(segregationError(actors, "approve", "ben")).toBeNull();
  });

  it("refuses an automated actor for any human approval step", () => {
    const actors = { preparedBy: "amy", reviewedBy: null, approvedBy: null, publishedBy: null };
    expect(segregationError(actors, "approve", "service_role")).toMatch(/automated actor/);
    expect(segregationError(actors, "publish", "service:cron")).toMatch(/automated actor/);
  });

  it("names the provenance a published statement is missing", () => {
    const missing = missingStatementProvenance({
      offering_id: "fund",
      report_type: "balance_sheet",
      period_end: "2026-03-31",
      basis: "accrual",
      book_id: "book",
      period_id: "period",
      gl_cutoff_at: "2026-04-02T00:00:00Z",
      mapping_version: 1,
      nav_version_id: "nav",
      valuation_versions: [{ assetId: "a" }],
      generated_by: "amy",
      prepared_by: "amy",
      reviewed_by: "ben",
      approved_by: "cara",
    });
    expect(missing).toEqual(["published_by", "published_at"]);
  });
});

describe("close checklist and publication", () => {
  const checklist: ChecklistItem[] = [
    { item_key: "cash_reconciled", blocking: true, status: "complete" },
    { item_key: "nav_approved", blocking: true, status: "pending" },
    { item_key: "review_notes_resolved", blocking: false, status: "pending" },
  ];

  it("blocks only on configured blocking items", () => {
    expect(closeBlockers(checklist)).toEqual(["nav_approved"]);
  });

  it("refuses publication while a blocking item or exception is open", () => {
    const reasons = publicationBlockers({
      status: "approved",
      exceptions: [
        { kind: "trial_balance_unbalanced", severity: "blocking", detail: "Out by 700 cents." },
      ],
      checklist,
    });
    expect(reasons).toContain("Out by 700 cents.");
    expect(reasons).toContain("Close item outstanding: nav_approved.");
  });

  it("refuses publication of anything that is not approved", () => {
    expect(
      publicationBlockers({ status: "review", exceptions: [], checklist: [] })[0],
    ).toMatch(/Only an approved report/);
  });
});

describe("workpapers", () => {
  it("walks draft to approved and stops there", () => {
    expect(canTransitionWorkpaper("draft", "prepared")).toBe(true);
    expect(canTransitionWorkpaper("review", "approved")).toBe(true);
    expect(canTransitionWorkpaper("approved", "draft")).toBe(false);
  });

  it("needs a second person to sign off", () => {
    expect(
      workpaperSignoffError({ preparedBy: "amy", status: "review" }, "amy", "approved"),
    ).toMatch(/other than its preparer/);
    expect(
      workpaperSignoffError({ preparedBy: "amy", status: "review" }, "ben", "approved"),
    ).toBeNull();
  });
});

describe("visibility", () => {
  const published = {
    status: "published" as const,
    statement: "balance_sheet" as const,
    managerVisible: true,
    investorVisible: true,
  };

  it("keeps internal statements away from investors", () => {
    expect(investorMaySee("trial_balance")).toBe(false);
    expect(investorMaySee("balance_sheet")).toBe(true);
    expect(
      mayViewReport(
        { ...published, statement: "general_ledger" },
        { audience: "investor", userId: "amy", managesFund: false, holdsPosition: true },
      ),
    ).toBe(false);
  });

  it("only lets a manager of that fund see its published financials", () => {
    expect(
      mayViewReport(published, { audience: "manager", managesFund: true, holdsPosition: false }),
    ).toBe(true);
    expect(
      mayViewReport(published, { audience: "manager", managesFund: false, holdsPosition: false }),
    ).toBe(false);
  });

  it("never shows one investor another investor's report", () => {
    expect(
      mayViewReport(
        { ...published, subjectUserId: "amy" },
        { audience: "investor", userId: "ben", managesFund: false, holdsPosition: true },
      ),
    ).toBe(false);
    expect(
      mayViewReport(
        { ...published, subjectUserId: "amy" },
        { audience: "investor", userId: "amy", managesFund: false, holdsPosition: true },
      ),
    ).toBe(true);
  });

  it("hides unpublished work from everyone but Harmonious", () => {
    const draft = { ...published, status: "draft" as const };
    expect(mayViewReport(draft, { audience: "harmonious", managesFund: false, holdsPosition: false })).toBe(true);
    expect(mayViewReport(draft, { audience: "manager", managesFund: true, holdsPosition: false })).toBe(false);
  });
});

describe("comparatives", () => {
  it("derives the immediately preceding period of the same length", () => {
    expect(priorPeriodBounds("2026-04-01", "2026-06-30")).toEqual({
      start: "2026-01-01",
      end: "2026-03-31",
    });
  });
});
