import { describe, expect, it } from "vitest";

import {
  activityFromBalances,
  canPublish,
  canSubmitForReview,
  canTransitionNav,
  canOverride,
  capitalHandoff,
  DEFAULT_NAV_POLICY,
  managerMayNav,
  navBridge,
  navChange,
  navChecks,
  navPackage,
  navPerUnitCents,
  periodBoundsFor,
  publicationBlockers,
  revisionImpact,
  segregationError,
  type LedgerBalance,
  type NavCheckContext,
} from "@/lib/nav-model";
import { valuationAsOf, type ValuationRecord } from "@/lib/valuation-model";

const bal = (
  code: string,
  accountType: LedgerBalance["accountType"],
  subtype: LedgerBalance["subtype"],
  debitCents: number,
  creditCents: number,
): LedgerBalance => ({
  accountId: code,
  code,
  name: code,
  accountType,
  subtype,
  debitCents,
  creditCents,
});

const CLEAN: NavCheckContext = {
  ledgerDebitCents: 1_000,
  ledgerCreditCents: 1_000,
  unreconciledCashCents: 0,
  unpostedJournalCents: 0,
  openExceptionCount: 0,
  assetsMissingValuation: [],
  staleValuations: [],
  valuationExceptionCount: 0,
  missingExpenseAccrual: false,
  openReceivablesPayablesCents: 0,
  unresolvedCapitalActivityCents: 0,
  periodStatus: "soft_closed",
  futureValuations: [],
  bridgeDifferenceCents: 0,
  valuationCarryingDifferenceCents: 0,
};

describe("NAV periods", () => {
  it("derives the period each frequency implies", () => {
    expect(periodBoundsFor("quarterly", "2026-06-30").start).toBe("2026-04-01");
    expect(periodBoundsFor("monthly", "2026-06-30").start).toBe("2026-06-01");
    expect(periodBoundsFor("annually", "2026-06-30").start).toBe("2026-01-01");
    expect(periodBoundsFor("weekly", "2026-06-30").start).toBe("2026-06-24");
    expect(periodBoundsFor("daily", "2026-06-30")).toMatchObject({
      start: "2026-06-30",
      end: "2026-06-30",
    });
  });
});

describe("NAV lifecycle", () => {
  it("walks draft through to published", () => {
    expect(canTransitionNav("draft", "review")).toBe(true);
    expect(canTransitionNav("review", "approved")).toBe(true);
    expect(canTransitionNav("approved", "published")).toBe(true);
    expect(canTransitionNav("published", "superseded")).toBe(true);
  });

  it("never reopens or edits a published NAV", () => {
    expect(canTransitionNav("published", "approved")).toBe(false);
    expect(canTransitionNav("published", "draft")).toBe(false);
    expect(canTransitionNav("superseded", "published")).toBe(false);
    expect(canTransitionNav("draft", "published")).toBe(false);
  });
});

describe("segregation of duties", () => {
  it("will not approve a NAV nobody reviewed", () => {
    expect(segregationError({ preparedBy: "u1" }, "u2", "approve")).toMatch(/reviewed before/i);
  });

  it("stops the preparer approving their own NAV", () => {
    expect(segregationError({ preparedBy: "u1" }, "u1", "approve")).toMatch(/other than/);
    expect(segregationError({ preparedBy: "u1", reviewedBy: "u2" }, "u2", "approve")).toBeNull();
  });

  it("stops the reviewer publishing", () => {
    expect(segregationError({ preparedBy: "u1", reviewedBy: "u2" }, "u2", "publish")).toMatch(
      /other than the reviewer/,
    );
    expect(segregationError({ preparedBy: "u1", reviewedBy: "u2" }, "u3", "publish")).toBeNull();
  });

  it("refuses an automated actor standing in for a human approval", () => {
    expect(segregationError({ preparedBy: "u1" }, null, "approve")).toMatch(/human approver/);
    expect(segregationError({ preparedBy: "u1" }, null, "publish")).toMatch(/human approver/);
  });
});

describe("NAV package", () => {
  const balances = [
    bal("1000", "asset", "cash", 5_000_00, 1_000_00),
    bal("1100", "asset", "investments", 10_000_00, 0),
    bal("1200", "asset", "receivable", 500_00, 0),
    bal("2000", "liability", "payable", 0, 300_00),
    bal("2100", "liability", "accrued_expense", 0, 200_00),
    bal("2200", "liability", "management_fee", 0, 250_00),
  ];

  it("adds assets and takes off liabilities", () => {
    const pkg = navPackage({ balances, investmentsFairValueCents: 12_000_00 });
    expect(pkg.cashCents).toBe(4_000_00);
    expect(pkg.grossAssetsCents).toBe(4_000_00 + 12_000_00 + 500_00);
    expect(pkg.totalLiabilitiesCents).toBe(750_00);
    expect(pkg.netAssetValueCents).toBe(4_000_00 + 12_000_00 + 500_00 - 750_00);
  });

  it("falls back to ledger carrying value when no valuation is supplied", () => {
    const pkg = navPackage({ balances });
    expect(pkg.investmentsFairValueCents).toBe(10_000_00);
  });

  it("only unitises funds that use units", () => {
    expect(navPackage({ balances, unitsOutstanding: 1_000 }).navPerUnitCents).toBeNull();
    const unitised = navPackage({
      balances,
      investmentsFairValueCents: 12_000_00,
      unitAccounting: true,
      unitsOutstanding: 1_000,
    });
    expect(unitised.navPerUnitCents).toBe(Math.round(unitised.netAssetValueCents / 1000));
    expect(navPerUnitCents(100, 0)).toBeNull();
  });
});

describe("NAV bridge", () => {
  const activity = {
    contributionsCents: 1_000_00,
    distributionsCents: 200_00,
    investmentIncomeCents: 50_00,
    realizedGainCents: 300_00,
    realizedLossCents: 0,
    unrealizedGainCents: 400_00,
    unrealizedLossCents: 100_00,
    managementFeesCents: 60_00,
    fundExpensesCents: 40_00,
    otherCents: 0,
  };

  it("reconciles exactly to ending NAV", () => {
    const ending = 10_000_00 + 1_000_00 - 200_00 + 50_00 + 300_00 + 400_00 - 100_00 - 60_00 - 40_00;
    const bridge = navBridge(10_000_00, activity, ending);
    expect(bridge.differenceCents).toBe(0);
    expect(bridge.reconciles).toBe(true);
  });

  it("turns any unexplained difference into a blocking exception", () => {
    const bridge = navBridge(10_000_00, activity, 12_000_00);
    expect(bridge.reconciles).toBe(false);
    const checks = navChecks(
      { ...CLEAN, bridgeDifferenceCents: bridge.differenceCents },
      DEFAULT_NAV_POLICY,
    );
    const failing = checks.find((c) => c.code === "bridge_unreconciled");
    expect(failing?.severity).toBe("blocking");
    expect(failing?.overridable).toBe(false);
  });

  it("reads period movement from postings, not from typed figures", () => {
    const movement = activityFromBalances([
      bal("3100", "equity", "contribution", 0, 1_000_00),
      bal("3200", "equity", "distribution", 200_00, 0),
      bal("4300", "income", "realized_gain", 0, 300_00),
      bal("4400", "income", "unrealized_gain", 100_00, 0),
      bal("5000", "expense", "management_fee", 60_00, 0),
    ]);
    expect(movement.contributionsCents).toBe(1_000_00);
    expect(movement.distributionsCents).toBe(200_00);
    expect(movement.realizedGainCents).toBe(300_00);
    expect(movement.unrealizedLossCents).toBe(100_00);
    expect(movement.managementFeesCents).toBe(60_00);
  });
});

describe("pre-NAV checks", () => {
  it("passes a clean fund", () => {
    const checks = navChecks(CLEAN, DEFAULT_NAV_POLICY);
    expect(checks.every((c) => c.severity === "pass")).toBe(true);
    expect(canSubmitForReview(checks)).toBe(true);
  });

  it("always blocks on an unbalanced ledger and never allows an override", () => {
    const checks = navChecks({ ...CLEAN, ledgerCreditCents: 900 }, DEFAULT_NAV_POLICY);
    const imbalance = checks.find((c) => c.code === "ledger_imbalance")!;
    expect(imbalance.severity).toBe("blocking");
    expect(canOverride("ledger_imbalance")).toBe(false);
    expect(
      canPublish(checks, [
        { code: "ledger_imbalance", reason: "signed off by the auditor", by: "u1", at: "now" },
      ]),
    ).toBe(false);
  });

  it("blocks publication on unreconciled material cash", () => {
    const checks = navChecks({ ...CLEAN, unreconciledCashCents: 500_000 }, DEFAULT_NAV_POLICY);
    expect(checks.find((c) => c.code === "unreconciled_cash")?.severity).toBe("blocking");
    expect(canSubmitForReview(checks)).toBe(false);
  });

  it("blocks publication on unposted material journals", () => {
    const checks = navChecks({ ...CLEAN, unpostedJournalCents: 800_000 }, DEFAULT_NAV_POLICY);
    expect(checks.find((c) => c.code === "unposted_journals")?.severity).toBe("blocking");
  });

  it("ignores immaterial amounts under the fund's tolerance", () => {
    const checks = navChecks({ ...CLEAN, unreconciledCashCents: 5_000 }, DEFAULT_NAV_POLICY);
    expect(checks.find((c) => c.code === "unreconciled_cash")?.severity).toBe("pass");
  });

  it("raises a stale valuation warning that a fund may choose to treat as blocking", () => {
    const ctx = { ...CLEAN, staleValuations: [{ assetName: "Acme", days: 400 }] };
    expect(navChecks(ctx, DEFAULT_NAV_POLICY).find((c) => c.code === "stale_valuation")?.severity).toBe(
      "warning",
    );
    const strict = { ...DEFAULT_NAV_POLICY, blockingChecks: ["stale_valuation" as const] };
    expect(navChecks(ctx, strict).find((c) => c.code === "stale_valuation")?.severity).toBe(
      "blocking",
    );
  });

  it("never lets a NAV rest on a valuation dated after the NAV date", () => {
    const checks = navChecks({ ...CLEAN, futureValuations: ["Acme"] }, DEFAULT_NAV_POLICY);
    const future = checks.find((c) => c.code === "future_valuation")!;
    expect(future.severity).toBe("blocking");
    expect(future.overridable).toBe(false);
  });

  it("allows a documented override of an eligible warning only", () => {
    const checks = navChecks({ ...CLEAN, unreconciledCashCents: 500_000 }, DEFAULT_NAV_POLICY);
    expect(canPublish(checks, [])).toBe(false);
    expect(
      canPublish(checks, [
        { code: "unreconciled_cash", reason: "too short", by: "u1", at: "now" },
      ]),
    ).toBe(false);
    expect(
      canPublish(checks, [
        {
          code: "unreconciled_cash",
          reason: "Wire lands 1 July; documented with the bank.",
          by: "u1",
          at: "now",
        },
      ]),
    ).toBe(true);
    expect(publicationBlockers(checks, [])).toHaveLength(1);
  });
});

describe("historical integrity", () => {
  const versions: ValuationRecord[] = [
    { id: "v1", assetId: "a", effectiveDate: "2026-03-31", version: 1, status: "superseded", valueCents: 1_000_00 },
    { id: "v2", assetId: "a", effectiveDate: "2026-06-30", version: 2, status: "effective", valueCents: 1_500_00 },
    { id: "v3", assetId: "a", effectiveDate: "2026-09-30", version: 3, status: "effective", valueCents: 2_000_00 },
  ];

  it("uses the valuation version effective on the NAV date, not today's", () => {
    expect(valuationAsOf(versions, "2026-06-30")?.id).toBe("v2");
    expect(valuationAsOf(versions, "2026-04-30")?.id).toBe("v1");
  });

  it("stays reproducible when a later valuation is added", () => {
    const later = [
      ...versions,
      { id: "v4", assetId: "a", effectiveDate: "2026-12-31", version: 4, status: "effective" as const, valueCents: 9_000_00 },
    ];
    expect(valuationAsOf(later, "2026-06-30")?.valueCents).toBe(1_500_00);
  });
});

describe("manager rights", () => {
  it("lets managers view, acknowledge or challenge but never publish", () => {
    expect(managerMayNav("view", "view")).toBe(true);
    expect(managerMayNav("acknowledge", "view")).toBe(false);
    expect(managerMayNav("challenge", "acknowledge")).toBe(false);
    expect(managerMayNav("challenge", "challenge")).toBe(true);
    expect(managerMayNav("approve", "challenge")).toBe(false);
    expect(managerMayNav("approve", "approve")).toBe(true);
    expect(managerMayNav("publish", "approve")).toBe(false);
  });
});

describe("revisions and handoff", () => {
  it("measures the impact of a revision against the original", () => {
    expect(revisionImpact(10_000_00, 9_500_00)).toEqual({ impactCents: -50_000, impactPct: -5 });
    expect(navChange(0, 100).changePct).toBeNull();
  });

  it("hands off period results without allocating them to anyone", () => {
    const pkg = navPackage({ balances: [bal("1000", "asset", "cash", 1_000_00, 0)] });
    const handoff = capitalHandoff(
      { start: "2026-04-01", end: "2026-06-30" },
      {
        contributionsCents: 500_00,
        distributionsCents: 100_00,
        investmentIncomeCents: 20_00,
        realizedGainCents: 30_00,
        realizedLossCents: 10_00,
        unrealizedGainCents: 40_00,
        unrealizedLossCents: 0,
        managementFeesCents: 15_00,
        fundExpensesCents: 5_00,
        otherCents: 0,
      },
      pkg,
    );
    expect(handoff.netIncomeCents).toBe(20_00 + 20_00 + 40_00 - 15_00 - 5_00);
    expect(handoff.endingNetAssetsCents).toBe(pkg.netAssetValueCents);
    expect(Object.keys(handoff)).not.toContain("investors");
  });
});
