/**
 * Pure performance calculation rules.
 *
 * Nothing in this module reads a database and nothing here invents a number.
 * Every function takes figures that already came from posted accounting, an
 * approved NAV, or a finalized allocation run, and turns them into return
 * measures with an explicit, testable methodology. When the inputs cannot
 * support a measure the function says so — it never fabricates a result.
 */

export { segregationError } from "@/lib/financial-reporting-model";

// ---------------------------------------------------------------- periods

export const PERIOD_KINDS = [
  "month",
  "quarter",
  "year",
  "year_to_date",
  "inception_to_date",
  "custom",
] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export const PERIOD_LABELS: Record<PeriodKind, string> = {
  month: "Month",
  quarter: "Quarter",
  year: "Year",
  year_to_date: "Year to date",
  inception_to_date: "Since inception",
  custom: "Custom period",
};

export function isPeriodKind(value: string): value is PeriodKind {
  return (PERIOD_KINDS as readonly string[]).includes(value);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function utc(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return iso(utc(date) + days * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

/**
 * Exact inclusive beginning and end dates for a reporting period.
 * `periodEnd` anchors the period; `inception` bounds since-inception reporting.
 */
export function periodBounds(
  kind: PeriodKind,
  periodEnd: string,
  options: { inception?: string | null; periodStart?: string | null } = {},
): { periodStart: string; periodEnd: string; label: string } {
  const end = periodEnd.slice(0, 10);
  const [y, m] = [Number(end.slice(0, 4)), Number(end.slice(5, 7))];

  if (kind === "custom") {
    const start = options.periodStart?.slice(0, 10);
    if (!start) throw new Error("A custom period needs an explicit start date.");
    if (start > end) throw new Error("A period cannot end before it starts.");
    return { periodStart: start, periodEnd: end, label: `${start} to ${end}` };
  }

  if (kind === "inception_to_date") {
    const start = options.inception?.slice(0, 10);
    if (!start) throw new Error("Since-inception reporting needs the fund's inception date.");
    return { periodStart: start, periodEnd: end, label: `Since inception to ${end}` };
  }

  if (kind === "year_to_date") {
    const start = `${y}-01-01`;
    return { periodStart: start, periodEnd: end, label: `${y} year to date` };
  }

  if (kind === "year") {
    return { periodStart: `${y}-01-01`, periodEnd: `${y}-12-31`, label: `${y}` };
  }

  if (kind === "quarter") {
    const q = Math.floor((m - 1) / 3);
    const startMonth = q * 3 + 1;
    const endMonth = startMonth + 2;
    const lastDay = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
    return {
      periodStart: `${y}-${String(startMonth).padStart(2, "0")}-01`,
      periodEnd: `${y}-${String(endMonth).padStart(2, "0")}-${lastDay}`,
      label: `Q${q + 1} ${y}`,
    };
  }

  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    periodStart: `${y}-${String(m).padStart(2, "0")}-01`,
    periodEnd: `${y}-${String(m).padStart(2, "0")}-${lastDay}`,
    label: `${y}-${String(m).padStart(2, "0")}`,
  };
}

// ------------------------------------------------------------- fund types

export const FUND_TYPES = ["spv", "venture", "private_equity", "hedge", "custom"] as const;
export type FundType = (typeof FUND_TYPES)[number];

export const FUND_TYPE_LABELS: Record<FundType, string> = {
  spv: "SPV / SPE",
  venture: "Venture capital",
  private_equity: "Private equity",
  hedge: "Hedge / liquid strategy",
  custom: "Custom configuration",
};

export const METRICS = [
  "beginning_nav",
  "ending_nav",
  "contributions",
  "distributions",
  "investment_income",
  "realized_gain",
  "unrealized_gain",
  "expenses",
  "management_fees",
  "carried_interest",
  "gross_return",
  "net_return",
  "irr",
  "moic",
  "tvpi",
  "dpi",
  "rvpi",
  "twr",
  "cumulative_return",
  "paid_in_capital",
  "unfunded_commitment",
  "nav_per_unit",
  "subscriptions_redemptions",
] as const;
export type MetricKey = (typeof METRICS)[number];

export function isFundType(value: string): value is FundType {
  return (FUND_TYPES as readonly string[]).includes(value);
}

const COMMON: MetricKey[] = [
  "beginning_nav",
  "ending_nav",
  "contributions",
  "distributions",
  "expenses",
  "management_fees",
  "gross_return",
  "net_return",
];

/** Which measures a fund type is normally reported on. Configuration, not law. */
export const FUND_TYPE_METRICS: Record<FundType, MetricKey[]> = {
  spv: [
    ...COMMON,
    "paid_in_capital",
    "realized_gain",
    "unrealized_gain",
    "moic",
    "irr",
    "carried_interest",
  ],
  venture: [
    ...COMMON,
    "paid_in_capital",
    "unfunded_commitment",
    "realized_gain",
    "unrealized_gain",
    "irr",
    "moic",
    "dpi",
    "rvpi",
    "tvpi",
    "carried_interest",
  ],
  private_equity: [
    ...COMMON,
    "paid_in_capital",
    "unfunded_commitment",
    "realized_gain",
    "unrealized_gain",
    "irr",
    "moic",
    "dpi",
    "rvpi",
    "tvpi",
    "carried_interest",
  ],
  hedge: [
    ...COMMON,
    "investment_income",
    "realized_gain",
    "unrealized_gain",
    "twr",
    "cumulative_return",
    "nav_per_unit",
    "subscriptions_redemptions",
  ],
  custom: [...COMMON],
};

export function metricsForFund(fundType: FundType, configured?: readonly string[] | null) {
  const chosen = (configured ?? []).filter((m): m is MetricKey =>
    (METRICS as readonly string[]).includes(m),
  );
  return chosen.length > 0 ? chosen : FUND_TYPE_METRICS[fundType];
}

export function metricApplies(
  metric: MetricKey,
  fundType: FundType,
  configured?: readonly string[] | null,
) {
  return metricsForFund(fundType, configured).includes(metric);
}

// -------------------------------------------------------------- methodology

export interface FeeTreatment {
  /** Fees deducted when computing the net return. */
  deductManagementFees: boolean;
  deductFundExpenses: boolean;
  deductCarriedInterest: boolean;
  /** Fees that a gross return deliberately ignores, recorded for the reader. */
  grossExcludes: string[];
}

export interface PerformanceMethodology {
  version: string;
  label: string;
  fundType: FundType;
  /** capital_flows (IRR/MOIC style) or time_weighted (unitised/liquid style). */
  calculationMethod: "capital_flows" | "time_weighted" | "both";
  metrics: MetricKey[];
  fees: FeeTreatment;
  /** Where in a period a cash flow is treated as occurring. */
  cashFlowTiming: "actual_dated" | "start_of_period" | "end_of_period" | "mid_period";
  annualization: "annualize_over_one_year" | "never" | "always";
  rounding: "basis_points";
  /** Paid-in capital, never commitment, unless a fund explicitly says otherwise. */
  capitalDefinition: "paid_in" | "commitment";
  benchmark?: { name: string; source: string; methodology: string } | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export const DEFAULT_METHODOLOGY: PerformanceMethodology = {
  version: "perf-v1",
  label: "Harmonious standard — dated cash flows, paid-in capital",
  fundType: "spv",
  calculationMethod: "capital_flows",
  metrics: FUND_TYPE_METRICS.spv,
  fees: {
    deductManagementFees: true,
    deductFundExpenses: true,
    deductCarriedInterest: true,
    grossExcludes: ["management_fees", "fund_expenses", "carried_interest"],
  },
  cashFlowTiming: "actual_dated",
  annualization: "annualize_over_one_year",
  rounding: "basis_points",
  capitalDefinition: "paid_in",
  benchmark: null,
  effectiveFrom: "2026-01-01",
};

export function methodologyForFundType(
  fundType: FundType,
  over: Partial<PerformanceMethodology> = {},
): PerformanceMethodology {
  const base: PerformanceMethodology = {
    ...DEFAULT_METHODOLOGY,
    fundType,
    metrics: FUND_TYPE_METRICS[fundType],
    calculationMethod: fundType === "hedge" ? "time_weighted" : "capital_flows",
  };
  return { ...base, ...over, fees: { ...base.fees, ...(over.fees ?? {}) } };
}

// ------------------------------------------------------------- cash flows

export type CashFlowDirection = "contribution" | "distribution" | "terminal_value";

export interface DatedCashFlow {
  date: string;
  /** Signed from the investor's point of view: money out is negative. */
  amountCents: number;
  direction: CashFlowDirection;
  /** Where the figure came from, so a published number stays reproducible. */
  source: string;
  sourceId?: string | null;
}

export function contributionFlow(
  date: string,
  amountCents: number,
  source: string,
  sourceId?: string | null,
): DatedCashFlow {
  return {
    date,
    amountCents: -Math.abs(amountCents),
    direction: "contribution",
    source,
    sourceId: sourceId ?? null,
  };
}

export function distributionFlow(
  date: string,
  amountCents: number,
  source: string,
  sourceId?: string | null,
): DatedCashFlow {
  return {
    date,
    amountCents: Math.abs(amountCents),
    direction: "distribution",
    source,
    sourceId: sourceId ?? null,
  };
}

export function terminalFlow(date: string, valueCents: number, source: string): DatedCashFlow {
  return { date, amountCents: valueCents, direction: "terminal_value", source, sourceId: null };
}

// --------------------------------------------------------------- IRR / XIRR

export const IRR_STATUSES = [
  "solved",
  "not_calculated",
  "insufficient_data",
  "no_negative_flow",
  "no_positive_flow",
  "no_solution",
  "multiple_solutions",
  "period_too_short",
  "total_loss",
] as const;
export type IrrStatus = (typeof IRR_STATUSES)[number];

export interface IrrResult {
  status: IrrStatus;
  /** Annualised rate in basis points, or null when the inputs do not support one. */
  bps: number | null;
  detail: string;
  flows: DatedCashFlow[];
  spanDays: number;
}

const MIN_IRR_DAYS = 7;

function npv(flows: { t: number; amount: number }[], rate: number): number {
  return flows.reduce((sum, f) => sum + f.amount / Math.pow(1 + rate, f.t), 0);
}

/**
 * Date-sensitive IRR over actual dated cash flows.
 *
 * Returns an explicit status instead of a number whenever the inputs cannot
 * support one — a missing sign, a period too short to annualise, several
 * mathematical roots, or no root at all.
 */
export function xirr(input: readonly DatedCashFlow[]): IrrResult {
  const flows = [...input].sort((a, b) => a.date.localeCompare(b.date));
  const base = {
    flows,
    spanDays: flows.length > 1 ? daysBetween(flows[0]!.date, flows[flows.length - 1]!.date) : 0,
  };

  if (flows.length < 2) {
    return { status: "insufficient_data", bps: null, detail: "At least two dated cash flows are needed.", ...base };
  }
  if (!flows.some((f) => f.amountCents < 0)) {
    return { status: "no_negative_flow", bps: null, detail: "No invested capital, so there is no return to solve.", ...base };
  }
  if (!flows.some((f) => f.amountCents > 0)) {
    const zeroTerminal = flows.some((f) => f.direction === "terminal_value" && f.amountCents === 0);
    return {
      status: zeroTerminal ? "total_loss" : "no_positive_flow",
      bps: zeroTerminal ? -10000 : null,
      detail: zeroTerminal
        ? "No value or proceeds remain: the position is a total loss (−100%)."
        : "No proceeds or remaining value, so there is no return to solve.",
      ...base,
    };
  }
  if (base.spanDays < MIN_IRR_DAYS) {
    return {
      status: "period_too_short",
      bps: null,
      detail: `Cash flows span ${base.spanDays} day(s); an annualised rate would not be meaningful.`,
      ...base,
    };
  }

  const start = utc(flows[0]!.date);
  const series = flows.map((f) => ({
    t: (utc(f.date) - start) / (365 * DAY_MS),
    amount: f.amountCents,
  }));

  // Scan for sign changes of NPV across the feasible rate range.
  const brackets: [number, number][] = [];
  const lo = -0.999;
  const hi = 100;
  const steps = 400;
  let prevRate = lo;
  let prevValue = npv(series, lo);
  for (let i = 1; i <= steps; i += 1) {
    const rate = lo + ((hi - lo) * i) / steps;
    const value = npv(series, rate);
    if (Number.isFinite(prevValue) && Number.isFinite(value) && prevValue * value < 0) {
      brackets.push([prevRate, rate]);
    }
    prevRate = rate;
    prevValue = value;
  }

  if (brackets.length === 0) {
    return { status: "no_solution", bps: null, detail: "No rate makes these cash flows balance.", ...base };
  }
  if (brackets.length > 1) {
    return {
      status: "multiple_solutions",
      bps: null,
      detail: `These cash flows have ${brackets.length} mathematical solutions, so no single rate can be published.`,
      ...base,
    };
  }

  let [low, high] = brackets[0]!;
  let fLow = npv(series, low);
  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    const fMid = npv(series, mid);
    if (!Number.isFinite(fMid)) {
      return { status: "no_solution", bps: null, detail: "The rate search did not converge.", ...base };
    }
    if (Math.abs(fMid) < 1e-7 || high - low < 1e-12) {
      return { status: "solved", bps: Math.round(mid * 10000), detail: "Solved from dated cash flows.", ...base };
    }
    if (fLow * fMid < 0) {
      high = mid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  const rate = (low + high) / 2;
  return { status: "solved", bps: Math.round(rate * 10000), detail: "Solved from dated cash flows.", ...base };
}

// ---------------------------------------------------------------- MOIC etc.

export interface MultipleResult {
  investedCapitalCents: number;
  realizedValueCents: number;
  remainingValueCents: number;
  totalValueCents: number;
  moic: number | null;
  capitalDefinition: "paid_in" | "commitment";
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Total value over invested capital. Never computed against commitment by default. */
export function multipleOnInvestedCapital(input: {
  investedCapitalCents: number;
  realizedValueCents: number;
  remainingValueCents: number;
  capitalDefinition?: "paid_in" | "commitment";
}): MultipleResult {
  const total = input.realizedValueCents + input.remainingValueCents;
  return {
    investedCapitalCents: input.investedCapitalCents,
    realizedValueCents: input.realizedValueCents,
    remainingValueCents: input.remainingValueCents,
    totalValueCents: total,
    moic: input.investedCapitalCents > 0 ? round4(total / input.investedCapitalCents) : null,
    capitalDefinition: input.capitalDefinition ?? "paid_in",
  };
}

export interface PrivateMarketMultiples {
  paidInCapitalCents: number;
  distributionsCents: number;
  residualValueCents: number;
  dpi: number | null;
  rvpi: number | null;
  tvpi: number | null;
  capitalDefinition: "paid_in" | "commitment";
}

/** DPI, RVPI and TVPI, always against the stated capital definition. */
export function privateMarketMultiples(input: {
  paidInCapitalCents: number;
  distributionsCents: number;
  residualValueCents: number;
  capitalDefinition?: "paid_in" | "commitment";
}): PrivateMarketMultiples {
  const paid = input.paidInCapitalCents;
  const ok = paid > 0;
  return {
    paidInCapitalCents: paid,
    distributionsCents: input.distributionsCents,
    residualValueCents: input.residualValueCents,
    dpi: ok ? round4(input.distributionsCents / paid) : null,
    rvpi: ok ? round4(input.residualValueCents / paid) : null,
    tvpi: ok ? round4((input.distributionsCents + input.residualValueCents) / paid) : null,
    capitalDefinition: input.capitalDefinition ?? "paid_in",
  };
}

// ------------------------------------------------------- time-weighted return

export interface Subperiod {
  start: string;
  end: string;
  beginningValueCents: number;
  /** External money in (+) or out (−) applied at the start of the subperiod. */
  externalFlowCents: number;
  endingValueCents: number;
}

export interface SubperiodResult extends Subperiod {
  investedBaseCents: number;
  returnBps: number | null;
  note: string;
}

export interface TwrResult {
  status: "solved" | "not_calculated" | "insufficient_data" | "undefined_subperiod";
  bps: number | null;
  subperiods: SubperiodResult[];
  detail: string;
}

/**
 * Chain-linked time-weighted return. External contributions and distributions
 * change the invested base; they are never treated as investment performance.
 */
export function timeWeightedReturn(subperiods: readonly Subperiod[]): TwrResult {
  if (subperiods.length === 0) {
    return { status: "insufficient_data", bps: null, subperiods: [], detail: "No subperiods supplied." };
  }
  const results: SubperiodResult[] = [];
  let chained = 1;
  let undefinedBase = false;

  for (const sp of subperiods) {
    const base = sp.beginningValueCents + sp.externalFlowCents;
    if (base === 0) {
      undefinedBase = true;
      results.push({
        ...sp,
        investedBaseCents: 0,
        returnBps: null,
        note: "No invested base in this subperiod, so no return can be measured.",
      });
      continue;
    }
    const growth = sp.endingValueCents / base;
    chained *= growth;
    results.push({
      ...sp,
      investedBaseCents: base,
      returnBps: Math.round((growth - 1) * 10000),
      note: "Measured on the invested base after external cash flow.",
    });
  }

  const measured = results.filter((r) => r.returnBps !== null);
  if (measured.length === 0) {
    return {
      status: "undefined_subperiod",
      bps: null,
      subperiods: results,
      detail: "No subperiod had an invested base to measure.",
    };
  }
  return {
    status: undefinedBase ? "undefined_subperiod" : "solved",
    bps: Math.round((chained - 1) * 10000),
    subperiods: results,
    detail: undefinedBase
      ? "Chain-linked across measurable subperiods; at least one subperiod had no invested base."
      : "Chain-linked across subperiods bounded by external cash flows.",
  };
}

// ---------------------------------------------------------- gross vs net

export interface ReturnInputs {
  beginningValueCents: number;
  contributionsCents: number;
  distributionsCents: number;
  investmentIncomeCents: number;
  realizedGainCents: number;
  unrealizedGainCents: number;
  managementFeesCents: number;
  expensesCents: number;
  carriedInterestCents: number;
}

export interface GrossNetResult {
  averageCapitalCents: number;
  grossProfitCents: number;
  netProfitCents: number;
  grossReturnBps: number | null;
  netReturnBps: number | null;
  /** Exactly what each figure includes, preserved with the published report. */
  grossExcludes: string[];
  netDeducts: string[];
}

/**
 * Gross return is before the deductions the methodology names; net return is
 * after exactly those deductions, and nothing is labelled "net" otherwise.
 */
export function grossAndNetReturn(
  inputs: ReturnInputs,
  fees: FeeTreatment,
): GrossNetResult {
  const gross =
    inputs.investmentIncomeCents + inputs.realizedGainCents + inputs.unrealizedGainCents;

  const netDeducts: string[] = [];
  let net = gross;
  if (fees.deductManagementFees) {
    net -= inputs.managementFeesCents;
    netDeducts.push("management_fees");
  }
  if (fees.deductFundExpenses) {
    net -= inputs.expensesCents;
    netDeducts.push("fund_expenses");
  }
  if (fees.deductCarriedInterest) {
    net -= inputs.carriedInterestCents;
    netDeducts.push("carried_interest");
  }

  // Simple average capital: opening capital plus half of each external flow.
  const averageCapital =
    inputs.beginningValueCents +
    Math.round(inputs.contributionsCents / 2) -
    Math.round(inputs.distributionsCents / 2);

  const denominator = averageCapital > 0 ? averageCapital : 0;
  return {
    averageCapitalCents: averageCapital,
    grossProfitCents: gross,
    netProfitCents: net,
    grossReturnBps: denominator > 0 ? Math.round((gross / denominator) * 10000) : null,
    netReturnBps: denominator > 0 ? Math.round((net / denominator) * 10000) : null,
    grossExcludes: fees.grossExcludes,
    netDeducts,
  };
}

// ------------------------------------------------------------------ bridge

export interface BridgeInputs extends ReturnInputs {
  endingValueCents: number;
}

export interface BridgeLine {
  key: string;
  label: string;
  amountCents: number;
  sign: 1 | -1 | 0;
}

export interface PerformanceBridge {
  lines: BridgeLine[];
  computedEndingCents: number;
  reportedEndingCents: number;
  differenceCents: number;
  reconciles: boolean;
}

/**
 * Beginning value + contributions − distributions + income ± gains − fees
 * − expenses − carry = ending value. An unexplained difference is an exception,
 * never silently absorbed.
 */
export function performanceBridge(
  inputs: BridgeInputs,
  toleranceCents = 0,
): PerformanceBridge {
  const lines: BridgeLine[] = [
    { key: "beginning_value", label: "Beginning value", amountCents: inputs.beginningValueCents, sign: 0 },
    { key: "contributions", label: "Contributions", amountCents: inputs.contributionsCents, sign: 1 },
    { key: "distributions", label: "Distributions", amountCents: inputs.distributionsCents, sign: -1 },
    { key: "investment_income", label: "Investment income", amountCents: inputs.investmentIncomeCents, sign: 1 },
    { key: "realized_gain", label: "Realized gain / loss", amountCents: inputs.realizedGainCents, sign: 1 },
    { key: "unrealized_gain", label: "Unrealized gain / loss", amountCents: inputs.unrealizedGainCents, sign: 1 },
    { key: "management_fees", label: "Management fees", amountCents: inputs.managementFeesCents, sign: -1 },
    { key: "expenses", label: "Fund expenses", amountCents: inputs.expensesCents, sign: -1 },
    { key: "carried_interest", label: "Carried interest", amountCents: inputs.carriedInterestCents, sign: -1 },
  ];

  const computed = lines.reduce(
    (total, line) => total + (line.sign === 0 ? line.amountCents : line.sign * line.amountCents),
    0,
  );
  const difference = inputs.endingValueCents - computed;
  return {
    lines: [
      ...lines,
      { key: "ending_value", label: "Ending value", amountCents: inputs.endingValueCents, sign: 0 },
    ],
    computedEndingCents: computed,
    reportedEndingCents: inputs.endingValueCents,
    differenceCents: difference,
    reconciles: Math.abs(difference) <= toleranceCents,
  };
}

// -------------------------------------------------------------- exceptions

export const PERFORMANCE_EXCEPTION_KINDS = [
  "missing_beginning_nav",
  "missing_ending_nav",
  "unresolved_capital_activity",
  "bridge_unreconciled",
  "invalid_irr_inputs",
  "missing_methodology",
  "stale_source_data",
  "investor_totals_mismatch",
  "large_performance_movement",
  "benchmark_unavailable",
] as const;
export type PerformanceExceptionKind = (typeof PERFORMANCE_EXCEPTION_KINDS)[number];

export interface PerformanceException {
  kind: PerformanceExceptionKind;
  severity: "warning" | "blocking";
  detail: string;
  context?: Record<string, string | number | boolean | null>;
}

export interface ExceptionInputs {
  beginningNavFound: boolean;
  endingNavFound: boolean;
  allocationFinalized: boolean;
  bridge: PerformanceBridge;
  irr: IrrResult | null;
  methodologyFound: boolean;
  sourceCutoffAt: string | null;
  periodEnd: string;
  investorEndingTotalCents: number | null;
  fundEndingValueCents: number;
  priorNetReturnBps: number | null;
  netReturnBps: number | null;
  largeMovementThresholdBps: number;
  benchmarksRequested: boolean;
  benchmarksAvailable: boolean;
  /** Kinds this fund's policy escalates from warning to blocking. */
  blockingKinds?: readonly string[];
}

const STALE_DAYS = 45;

export function performanceExceptions(input: ExceptionInputs): PerformanceException[] {
  const found: PerformanceException[] = [];
  const escalate = new Set(input.blockingKinds ?? []);
  const add = (
    kind: PerformanceExceptionKind,
    severity: "warning" | "blocking",
    detail: string,
    context?: Record<string, string | number | boolean | null>,
  ) =>
    found.push({
      kind,
      severity: escalate.has(kind) ? "blocking" : severity,
      detail,
      ...(context ? { context } : {}),
    });

  if (!input.beginningNavFound) {
    add("missing_beginning_nav", "warning", "No approved fund value exists at the start of this period.");
  }
  if (!input.endingNavFound) {
    add("missing_ending_nav", "blocking", "No approved fund value exists at the end of this period.");
  }
  if (!input.allocationFinalized) {
    add("unresolved_capital_activity", "blocking", "Investor capital for this period is not finalized.");
  }
  if (!input.bridge.reconciles) {
    add("bridge_unreconciled", "blocking", "The performance bridge does not explain the change in value.", {
      differenceCents: input.bridge.differenceCents,
    });
  }
  if (input.irr && input.irr.status !== "solved" && input.irr.status !== "not_calculated") {
    add("invalid_irr_inputs", "warning", input.irr.detail, { irrStatus: input.irr.status });
  }
  if (!input.methodologyFound) {
    add("missing_methodology", "blocking", "No performance methodology version applies to this period.");
  }
  if (input.sourceCutoffAt) {
    const days = daysBetween(input.periodEnd, input.sourceCutoffAt.slice(0, 10));
    if (days > STALE_DAYS) {
      add("stale_source_data", "warning", `Source data was cut off ${days} days after the period end.`, {
        days,
      });
    }
  }
  if (
    input.investorEndingTotalCents !== null &&
    input.investorEndingTotalCents !== input.fundEndingValueCents
  ) {
    add(
      "investor_totals_mismatch",
      "blocking",
      "Investor capital does not add up to the fund's net assets for this period.",
      {
        differenceCents: input.fundEndingValueCents - input.investorEndingTotalCents,
      },
    );
  }
  if (
    input.priorNetReturnBps !== null &&
    input.netReturnBps !== null &&
    Math.abs(input.netReturnBps - input.priorNetReturnBps) > input.largeMovementThresholdBps
  ) {
    add("large_performance_movement", "warning", "Return moved sharply against the prior period.", {
      changeBps: input.netReturnBps - input.priorNetReturnBps,
    });
  }
  if (input.benchmarksRequested && !input.benchmarksAvailable) {
    add("benchmark_unavailable", "warning", "No benchmark value is available for this period.");
  }
  return found;
}

export function blockingPerformanceExceptions(exceptions: readonly PerformanceException[]) {
  return exceptions.filter((e) => e.severity === "blocking");
}

// --------------------------------------------------------------- lifecycle

export const PERFORMANCE_STATUSES = [
  "draft",
  "prepared",
  "review",
  "approved",
  "published",
  "superseded",
] as const;
export type PerformanceStatus = (typeof PERFORMANCE_STATUSES)[number];

export const PERFORMANCE_FLOW: Record<PerformanceStatus, PerformanceStatus[]> = {
  draft: ["prepared"],
  prepared: ["review", "draft"],
  review: ["approved", "prepared"],
  approved: ["published", "review"],
  published: ["superseded"],
  superseded: [],
};

export function canTransitionPerformance(from: PerformanceStatus, to: PerformanceStatus) {
  return (PERFORMANCE_FLOW[from] ?? []).includes(to);
}

export function isImmutablePerformance(status: PerformanceStatus) {
  return status === "published" || status === "superseded";
}

export function publicationBlockers(input: {
  status: PerformanceStatus;
  exceptions: readonly PerformanceException[];
}): string[] {
  const blockers: string[] = [];
  if (input.status !== "approved") blockers.push("Only an approved performance report can be published.");
  for (const e of blockingPerformanceExceptions(input.exceptions)) {
    blockers.push(e.detail);
  }
  return blockers;
}

/** Everything a published performance number must carry to stay reproducible. */
export const REQUIRED_PERFORMANCE_PROVENANCE = [
  "methodology_version",
  "nav_version_id",
  "period_start",
  "period_end",
  "prepared_by",
  "approved_by",
  "published_by",
] as const;

export function missingPerformanceProvenance(record: Record<string, unknown>): string[] {
  return REQUIRED_PERFORMANCE_PROVENANCE.filter((key) => {
    const value = record[key];
    return value === null || value === undefined || value === "";
  });
}

// -------------------------------------------------------------- benchmarks

export interface BenchmarkEntry {
  name: string;
  source: string;
  methodology: string;
  periodStart: string;
  periodEnd: string;
  returnBps: number | null;
  valueStatus: "provided" | "unavailable" | "stale";
  asOf?: string | null;
  note?: string | null;
}

/**
 * Benchmarks are optional. A value is only ever reported for the exact period
 * it covers — a stale or missing value is labelled, never substituted.
 */
export function normaliseBenchmark(
  entry: Partial<BenchmarkEntry> & { name: string; source: string; periodStart: string; periodEnd: string },
  requestedPeriod: { periodStart: string; periodEnd: string },
): BenchmarkEntry {
  const matchesPeriod =
    entry.periodStart === requestedPeriod.periodStart && entry.periodEnd === requestedPeriod.periodEnd;
  const hasValue = entry.returnBps !== null && entry.returnBps !== undefined;
  return {
    name: entry.name,
    source: entry.source,
    methodology: entry.methodology ?? "",
    periodStart: entry.periodStart,
    periodEnd: entry.periodEnd,
    returnBps: hasValue && matchesPeriod ? Number(entry.returnBps) : null,
    valueStatus: !hasValue ? "unavailable" : matchesPeriod ? "provided" : "stale",
    asOf: entry.asOf ?? null,
    note: entry.note ?? null,
  };
}

// ------------------------------------------------------- investor measures

export interface InvestorPerformanceInputs {
  positionId: string;
  displayName: string;
  capacity: string;
  beginningCapitalCents: number;
  contributionsCents: number;
  distributionsCents: number;
  allocatedIncomeCents: number;
  realizedGainCents: number;
  unrealizedGainCents: number;
  feesCents: number;
  expensesCents: number;
  carryCents: number;
  endingCapitalCents: number;
  paidInCapitalCents: number;
  commitmentCents: number;
  /** Dated cash flows for this position only — never the fund's. */
  cashFlows: DatedCashFlow[];
  lifetimeDistributionsCents: number;
}

export interface InvestorPerformanceResult {
  positionId: string;
  displayName: string;
  capacity: string;
  bridge: PerformanceBridge;
  returns: GrossNetResult;
  irr: IrrResult;
  multiples: MultipleResult;
  privateMultiples: PrivateMarketMultiples;
  exceptions: PerformanceException[];
}

/**
 * Investor performance is always computed from that position's own capital and
 * its own dated cash flows. A fund-level return is never copied down.
 */
export function investorPerformance(
  input: InvestorPerformanceInputs,
  methodology: PerformanceMethodology,
): InvestorPerformanceResult {
  const returnInputs: ReturnInputs = {
    beginningValueCents: input.beginningCapitalCents,
    contributionsCents: input.contributionsCents,
    distributionsCents: input.distributionsCents,
    investmentIncomeCents: input.allocatedIncomeCents,
    realizedGainCents: input.realizedGainCents,
    unrealizedGainCents: input.unrealizedGainCents,
    managementFeesCents: input.feesCents,
    expensesCents: input.expensesCents,
    carriedInterestCents: input.carryCents,
  };
  const bridge = performanceBridge({ ...returnInputs, endingValueCents: input.endingCapitalCents });
  const returns = grossAndNetReturn(returnInputs, methodology.fees);
  const irr = xirr(input.cashFlows);
  const multiples = multipleOnInvestedCapital({
    investedCapitalCents: input.paidInCapitalCents,
    realizedValueCents: input.lifetimeDistributionsCents,
    remainingValueCents: input.endingCapitalCents,
    capitalDefinition: methodology.capitalDefinition,
  });
  const privateMultiples = privateMarketMultiples({
    paidInCapitalCents: input.paidInCapitalCents,
    distributionsCents: input.lifetimeDistributionsCents,
    residualValueCents: input.endingCapitalCents,
    capitalDefinition: methodology.capitalDefinition,
  });

  const exceptions: PerformanceException[] = [];
  if (!bridge.reconciles) {
    exceptions.push({
      kind: "bridge_unreconciled",
      severity: "blocking",
      detail: `${input.displayName}: capital activity does not explain the change in capital.`,
      context: { differenceCents: bridge.differenceCents },
    });
  }
  if (irr.status !== "solved") {
    exceptions.push({
      kind: "invalid_irr_inputs",
      severity: "warning",
      detail: `${input.displayName}: ${irr.detail}`,
      context: { irrStatus: irr.status },
    });
  }

  return {
    positionId: input.positionId,
    displayName: input.displayName,
    capacity: input.capacity,
    bridge,
    returns,
    irr,
    multiples,
    privateMultiples,
    exceptions,
  };
}

/** Investor totals must add back to the fund, or the run is not publishable. */
export function investorTotalsTie(
  lines: readonly { endingCapitalCents: number }[],
  fundEndingValueCents: number,
) {
  const total = lines.reduce((sum, l) => sum + l.endingCapitalCents, 0);
  return { totalCents: total, differenceCents: fundEndingValueCents - total, ties: total === fundEndingValueCents };
}
