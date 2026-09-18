import { describe, expect, it } from "vitest";

import {
  DEFAULT_METHODOLOGY,
  canTransitionPerformance,
  contributionFlow,
  distributionFlow,
  grossAndNetReturn,
  investorPerformance,
  investorTotalsTie,
  isImmutablePerformance,
  methodologyForFundType,
  metricsForFund,
  missingPerformanceProvenance,
  multipleOnInvestedCapital,
  normaliseBenchmark,
  performanceBridge,
  performanceExceptions,
  periodBounds,
  privateMarketMultiples,
  publicationBlockers,
  terminalFlow,
  timeWeightedReturn,
  xirr,
  type ReturnInputs,
} from "@/lib/performance-model";

const flows = (
  items: [string, number, "in" | "out"][],
) =>
  items.map(([date, amount, dir]) =>
    dir === "in"
      ? contributionFlow(date, amount, "test")
      : distributionFlow(date, amount, "test"),
  );

const baseReturns: ReturnInputs = {
  beginningValueCents: 1_000_000,
  contributionsCents: 0,
  distributionsCents: 0,
  investmentIncomeCents: 50_000,
  realizedGainCents: 0,
  unrealizedGainCents: 100_000,
  managementFeesCents: 20_000,
  expensesCents: 10_000,
  carriedInterestCents: 5_000,
};

describe("periods", () => {
  it("bounds a quarter from its end date", () => {
    expect(periodBounds("quarter", "2025-05-14")).toEqual({
      periodStart: "2025-04-01",
      periodEnd: "2025-06-30",
      label: "Q2 2025",
    });
  });

  it("refuses a custom period without a start date", () => {
    expect(() => periodBounds("custom", "2025-06-30")).toThrow(/explicit start/);
  });

  it("refuses since-inception without an inception date", () => {
    expect(() => periodBounds("inception_to_date", "2025-06-30")).toThrow(/inception/);
  });
});

describe("fund type configuration", () => {
  it("does not force private-market multiples onto a hedge fund", () => {
    const hedge = metricsForFund("hedge");
    expect(hedge).toContain("twr");
    expect(hedge).not.toContain("dpi");
  });

  it("gives venture funds unfunded commitments and DPI", () => {
    const venture = metricsForFund("venture");
    expect(venture).toContain("unfunded_commitment");
    expect(venture).toContain("tvpi");
  });

  it("lets a fund's configuration override the defaults", () => {
    expect(metricsForFund("venture", ["irr", "moic"])).toEqual(["irr", "moic"]);
  });
});

describe("IRR", () => {
  it("solves a known set of dated cash flows", () => {
    const result = xirr([
      ...flows([["2023-01-01", 1_000_000, "in"]]),
      terminalFlow("2024-01-01", 1_200_000, "test"),
    ]);
    expect(result.status).toBe("solved");
    expect(result.bps! / 100).toBeCloseTo(20, 0);
  });

  it("returns an exception status rather than inventing a number when all flows are outgoing", () => {
    const result = xirr(flows([["2023-01-01", 1_000_000, "in"], ["2023-06-01", 500_000, "in"]]));
    expect(result.status).toBe("no_positive_flow");
    expect(result.bps).toBeNull();
  });

  it("refuses to annualise a period of a few days", () => {
    const result = xirr([
      ...flows([["2024-01-01", 1_000_000, "in"]]),
      terminalFlow("2024-01-03", 1_010_000, "test"),
    ]);
    expect(result.status).toBe("period_too_short");
    expect(result.bps).toBeNull();
  });

  it("reports a total loss rather than failing to converge", () => {
    const result = xirr([
      ...flows([["2023-01-01", 1_000_000, "in"]]),
      terminalFlow("2024-01-01", 0, "test"),
    ]);
    expect(result.bps).toBe(-10000);
  });

  it("needs more than one flow", () => {
    expect(xirr(flows([["2024-01-01", 100, "in"]])).status).toBe("insufficient_data");
  });
});

describe("multiples", () => {
  it("computes MOIC from realised and remaining value", () => {
    const result = multipleOnInvestedCapital({
      investedCapitalCents: 1_000_000,
      realizedValueCents: 400_000,
      remainingValueCents: 900_000,
    });
    expect(result.moic).toBe(1.3);
    expect(result.capitalDefinition).toBe("paid_in");
  });

  it("computes DPI, RVPI and TVPI against paid-in capital, not commitment", () => {
    const result = privateMarketMultiples({
      paidInCapitalCents: 2_000_000,
      distributionsCents: 500_000,
      residualValueCents: 2_500_000,
    });
    expect(result.dpi).toBe(0.25);
    expect(result.rvpi).toBe(1.25);
    expect(result.tvpi).toBe(1.5);
    expect(result.capitalDefinition).toBe("paid_in");
  });

  it("preserves a commitment-based definition when the methodology says so", () => {
    const result = privateMarketMultiples({
      paidInCapitalCents: 1_000_000,
      distributionsCents: 0,
      residualValueCents: 1_000_000,
      capitalDefinition: "commitment",
    });
    expect(result.capitalDefinition).toBe("commitment");
  });

  it("returns null rather than dividing by zero capital", () => {
    expect(
      multipleOnInvestedCapital({
        investedCapitalCents: 0,
        realizedValueCents: 0,
        remainingValueCents: 100,
      }).moic,
    ).toBeNull();
  });
});

describe("time-weighted return", () => {
  it("chain-links subperiods around an external cash flow", () => {
    const result = timeWeightedReturn([
      {
        start: "2025-01-01",
        end: "2025-03-31",
        beginningValueCents: 1_000_000,
        externalFlowCents: 0,
        endingValueCents: 1_100_000,
      },
      {
        start: "2025-04-01",
        end: "2025-06-30",
        beginningValueCents: 1_100_000,
        externalFlowCents: 500_000,
        endingValueCents: 1_760_000,
      },
    ]);
    expect(result.status).toBe("solved");
    // 10% then 10% chain-linked = 21%
    expect(result.bps).toBe(2100);
  });

  it("does not treat a subperiod with no invested base as performance", () => {
    const result = timeWeightedReturn([
      {
        start: "2025-01-01",
        end: "2025-03-31",
        beginningValueCents: 0,
        externalFlowCents: 0,
        endingValueCents: 100,
      },
    ]);
    expect(result.status).toBe("undefined_subperiod");
  });
});

describe("gross and net", () => {
  it("only deducts what the methodology names", () => {
    const gross = grossAndNetReturn(baseReturns, {
      deductManagementFees: false,
      deductFundExpenses: false,
      deductCarriedInterest: false,
      grossExcludes: [],
    });
    expect(gross.netDeducts).toEqual([]);
    expect(gross.netProfitCents).toBe(gross.grossProfitCents);

    const net = grossAndNetReturn(baseReturns, DEFAULT_METHODOLOGY.fees);
    expect(net.netDeducts).toEqual(["management_fees", "fund_expenses", "carried_interest"]);
    expect(net.netProfitCents).toBe(gross.grossProfitCents - 35_000);
    expect(net.netReturnBps!).toBeLessThan(net.grossReturnBps!);
  });
});

describe("performance bridge", () => {
  it("reconciles when the activity explains the change in value", () => {
    const bridge = performanceBridge({
      ...baseReturns,
      endingValueCents: 1_000_000 + 50_000 + 100_000 - 20_000 - 10_000 - 5_000,
    });
    expect(bridge.reconciles).toBe(true);
    expect(bridge.differenceCents).toBe(0);
  });

  it("never silently absorbs an unexplained difference", () => {
    const bridge = performanceBridge({ ...baseReturns, endingValueCents: 2_000_000 });
    expect(bridge.reconciles).toBe(false);
    expect(bridge.differenceCents).not.toBe(0);
  });
});

const exceptionInputs = (over: Partial<Parameters<typeof performanceExceptions>[0]> = {}) => ({
  beginningNavFound: true,
  endingNavFound: true,
  allocationFinalized: true,
  bridge: performanceBridge({ ...baseReturns, endingValueCents: 1_115_000 }),
  irr: xirr([
    ...flows([["2023-01-01", 1_000_000, "in"]]),
    terminalFlow("2024-01-01", 1_200_000, "test"),
  ]),
  methodologyFound: true,
  sourceCutoffAt: "2025-06-30T00:00:00.000Z",
  periodEnd: "2025-06-30",
  investorEndingTotalCents: 1_115_000,
  fundEndingValueCents: 1_115_000,
  priorNetReturnBps: 500,
  netReturnBps: 600,
  largeMovementThresholdBps: 5000,
  benchmarksRequested: false,
  benchmarksAvailable: false,
  ...over,
});

describe("exceptions and publication", () => {
  it("is clean when every input is present and reconciled", () => {
    expect(performanceExceptions(exceptionInputs())).toEqual([]);
  });

  it("blocks when there is no approved fund value at period end", () => {
    const found = performanceExceptions(exceptionInputs({ endingNavFound: false }));
    expect(found.some((e) => e.kind === "missing_ending_nav" && e.severity === "blocking")).toBe(true);
  });

  it("blocks when investor capital does not add back to the fund", () => {
    const found = performanceExceptions(exceptionInputs({ investorEndingTotalCents: 1 }));
    expect(found.some((e) => e.kind === "investor_totals_mismatch")).toBe(true);
  });

  it("escalates a warning when the fund policy says so", () => {
    const found = performanceExceptions(
      exceptionInputs({ beginningNavFound: false, blockingKinds: ["missing_beginning_nav"] }),
    );
    expect(found.find((e) => e.kind === "missing_beginning_nav")!.severity).toBe("blocking");
  });

  it("only publishes an approved report with no blocking exceptions", () => {
    expect(publicationBlockers({ status: "review", exceptions: [] })).toHaveLength(1);
    expect(publicationBlockers({ status: "approved", exceptions: [] })).toEqual([]);
    expect(
      publicationBlockers({
        status: "approved",
        exceptions: [{ kind: "bridge_unreconciled", severity: "blocking", detail: "off" }],
      }),
    ).toHaveLength(1);
  });

  it("requires full provenance on a published number", () => {
    expect(
      missingPerformanceProvenance({
        methodology_version: "venture-v1",
        nav_version_id: "nav",
        period_start: "2025-01-01",
        period_end: "2025-03-31",
        prepared_by: "a",
        approved_by: "b",
        published_by: null,
      }),
    ).toEqual(["published_by"]);
  });
});

describe("lifecycle", () => {
  it("follows draft → prepared → review → approved → published", () => {
    expect(canTransitionPerformance("draft", "prepared")).toBe(true);
    expect(canTransitionPerformance("prepared", "published")).toBe(false);
    expect(canTransitionPerformance("approved", "published")).toBe(true);
  });

  it("locks a published or superseded report", () => {
    expect(isImmutablePerformance("published")).toBe(true);
    expect(isImmutablePerformance("superseded")).toBe(true);
    expect(isImmutablePerformance("review")).toBe(false);
  });
});

describe("benchmarks", () => {
  it("labels a value from another period as stale instead of using it", () => {
    const entry = normaliseBenchmark(
      { name: "Index", source: "Provider", periodStart: "2024-01-01", periodEnd: "2024-12-31", returnBps: 900 },
      { periodStart: "2025-01-01", periodEnd: "2025-12-31" },
    );
    expect(entry.valueStatus).toBe("stale");
    expect(entry.returnBps).toBeNull();
  });

  it("marks a missing value unavailable", () => {
    const entry = normaliseBenchmark(
      { name: "Index", source: "Provider", periodStart: "2025-01-01", periodEnd: "2025-12-31" },
      { periodStart: "2025-01-01", periodEnd: "2025-12-31" },
    );
    expect(entry.valueStatus).toBe("unavailable");
  });
});

describe("investor performance", () => {
  const methodology = methodologyForFundType("venture");

  const position = (over: Record<string, unknown> = {}) => ({
    positionId: "p1",
    displayName: "Jane Doe",
    capacity: "individual",
    beginningCapitalCents: 0,
    contributionsCents: 1_000_000,
    distributionsCents: 0,
    allocatedIncomeCents: 100_000,
    realizedGainCents: 0,
    unrealizedGainCents: 0,
    feesCents: 0,
    expensesCents: 0,
    carryCents: 0,
    endingCapitalCents: 1_100_000,
    paidInCapitalCents: 1_000_000,
    commitmentCents: 1_000_000,
    lifetimeDistributionsCents: 0,
    cashFlows: [
      ...flows([["2024-01-01", 1_000_000, "in"]]),
      terminalFlow("2025-01-01", 1_100_000, "capital_account:ending_capital"),
    ],
    ...over,
  }) as any;

  it("uses the investor's own cash flows, not the fund return", () => {
    const early = investorPerformance(position(), methodology);
    const mid = investorPerformance(
      position({
        cashFlows: [
          ...flows([["2024-07-01", 1_000_000, "in"]]),
          terminalFlow("2025-01-01", 1_100_000, "capital_account:ending_capital"),
        ],
      }),
      methodology,
    );
    expect(early.irr.status).toBe("solved");
    expect(mid.irr.status).toBe("solved");
    // Same money, half the time invested: the mid-period investor's IRR is higher.
    expect(mid.irr.bps!).toBeGreaterThan(early.irr.bps!);
  });

  it("keeps a person's separate investment profiles apart", () => {
    const individual = investorPerformance(position({ positionId: "ind" }), methodology);
    const trust = investorPerformance(
      position({
        positionId: "trust",
        contributionsCents: 500_000,
        allocatedIncomeCents: 0,
        endingCapitalCents: 500_000,
        paidInCapitalCents: 500_000,
        cashFlows: [
          ...flows([["2024-01-01", 500_000, "in"]]),
          terminalFlow("2025-01-01", 500_000, "capital_account:ending_capital"),
        ],
      }),
      methodology,
    );
    expect(individual.positionId).not.toBe(trust.positionId);
    expect(individual.multiples.moic).toBe(1.1);
    expect(trust.multiples.moic).toBe(1);
  });

  it("raises a blocking exception when a position's capital does not reconcile", () => {
    const result = investorPerformance(position({ endingCapitalCents: 9_999_999 }), methodology);
    expect(result.exceptions.some((e) => e.kind === "bridge_unreconciled" && e.severity === "blocking")).toBe(
      true,
    );
  });

  it("ties investor totals back to the fund", () => {
    expect(investorTotalsTie([{ endingCapitalCents: 600 }, { endingCapitalCents: 400 }], 1000).ties).toBe(true);
    expect(investorTotalsTie([{ endingCapitalCents: 600 }], 1000).differenceCents).toBe(400);
  });
});
