/**
 * Server-only fund and investor performance engine.
 *
 * Performance is a *presentation* of records that are already authoritative:
 * posted accounting → approved NAV → finalized capital activity → finalized
 * investor allocations. No return percentage is ever typed in, and no metric
 * is produced from anything the browser sent except a fund id, a period, and
 * an intent.
 *
 * Controls preserved here:
 *  - nothing trusts a fund, run or period id from the caller;
 *  - preparer ≠ reviewer ≠ approver, and Harmonious alone publishes;
 *  - a published performance report is never edited — corrections supersede;
 *  - investor performance uses that investor's own capital and cash flows;
 *  - a later NAV or valuation can never contaminate an earlier period.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reviewerScope, assertScopeAllows, type ReviewerScope } from "@/lib/reviewer-authz.server";
import { ledgerBookForOffering, registerReport } from "@/lib/accounting.server";
import {
  blockingPerformanceExceptions,
  canTransitionPerformance,
  contributionFlow,
  distributionFlow,
  DEFAULT_METHODOLOGY,
  FUND_TYPE_METRICS,
  grossAndNetReturn,
  investorPerformance,
  investorTotalsTie,
  isFundType,
  isPeriodKind,
  metricsForFund,
  missingPerformanceProvenance,
  methodologyForFundType,
  multipleOnInvestedCapital,
  normaliseBenchmark,
  performanceBridge,
  performanceExceptions,
  periodBounds,
  privateMarketMultiples,
  publicationBlockers,
  segregationError,
  terminalFlow,
  timeWeightedReturn,
  xirr,
  type BenchmarkEntry,
  type DatedCashFlow,
  type FundType,
  type PerformanceException,
  type PerformanceMethodology,
  type PerformanceStatus,
  type PeriodKind,
  type Subperiod,
} from "@/lib/performance-model";

const db = () => supabaseAdmin as any;
const nowIso = () => new Date().toISOString();

function fail(message: string): never {
  throw new Error(message);
}

const num = (v: unknown) => Number(v ?? 0);

// ------------------------------------------------------------- authority

async function assertHarmonious(userId: string): Promise<ReviewerScope> {
  const scope = await reviewerScope(userId);
  if (!scope.isAdmin) fail("Forbidden: Harmonious performance reporting authority required.");
  return scope;
}

async function authorizeFund(userId: string, offeringId: string) {
  const scope = await reviewerScope(userId);
  assertScopeAllows(scope, offeringId);
  return scope;
}

/** Re-read the run server-side and authorise against the fund it truly belongs to. */
async function authorizeRun(userId: string, runId: string) {
  const { data: run } = await db().from("performance_runs").select("*").eq("id", runId).maybeSingle();
  if (!run) fail("Performance report not found.");
  const scope = await authorizeFund(userId, run.offering_id);
  return { run, scope };
}

// ------------------------------------------------------- configuration

export async function fundPerformanceConfig(offeringId: string, bookId: string | null) {
  const { data: existing } = await db()
    .from("performance_configs")
    .select("*")
    .eq("offering_id", offeringId)
    .maybeSingle();
  if (existing) return existing;

  const { data: offering } = await db()
    .from("offerings")
    .select("id, reg_type, offering_kind")
    .eq("id", offeringId)
    .maybeSingle();
  const fundType: FundType = offering?.offering_kind === "fund" ? "venture" : "spv";

  const { data, error } = await db()
    .from("performance_configs")
    .insert({
      offering_id: offeringId,
      book_id: bookId,
      fund_type: fundType,
      enabled_metrics: FUND_TYPE_METRICS[fundType],
      default_frequency: "quarter",
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  return data;
}

/** The methodology version effective for a period. Later versions never apply. */
export async function methodologyFor(
  offeringId: string,
  bookId: string,
  fundType: FundType,
  periodEnd: string,
): Promise<{ id: string | null; methodology: PerformanceMethodology }> {
  const { data } = await db()
    .from("performance_methodologies")
    .select("*")
    .eq("offering_id", offeringId)
    .lte("effective_from", periodEnd)
    .order("effective_from", { ascending: false })
    .order("version", { ascending: false });

  const rows = ((data ?? []) as any[]).filter(
    (m) => !m.effective_to || String(m.effective_to) >= periodEnd,
  );
  const found = rows[0];
  if (found) return { id: found.id, methodology: rowToMethodology(found) };

  const seed = methodologyForFundType(fundType);
  const { data: created, error } = await db()
    .from("performance_methodologies")
    .insert({
      book_id: bookId,
      offering_id: offeringId,
      version: 1,
      label: seed.label,
      fund_type: seed.fundType,
      calculation_method: seed.calculationMethod,
      metrics: seed.metrics,
      fee_treatment: seed.fees,
      carry_treatment: { deduct: seed.fees.deductCarriedInterest },
      expense_treatment: { deduct: seed.fees.deductFundExpenses },
      cash_flow_timing: seed.cashFlowTiming,
      annualization: seed.annualization,
      rounding: seed.rounding,
      capital_definition: seed.capitalDefinition,
      effective_from: "2000-01-01",
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  return { id: created.id, methodology: rowToMethodology(created) };
}

function rowToMethodology(row: any): PerformanceMethodology {
  const fees = row.fee_treatment ?? {};
  return {
    version: `${row.fund_type ?? "spv"}-v${row.version ?? 1}`,
    label: row.label ?? DEFAULT_METHODOLOGY.label,
    fundType: isFundType(String(row.fund_type)) ? row.fund_type : "spv",
    calculationMethod: row.calculation_method ?? "capital_flows",
    metrics: metricsForFund(
      isFundType(String(row.fund_type)) ? row.fund_type : "spv",
      row.metrics ?? [],
    ),
    fees: {
      deductManagementFees: fees.deductManagementFees ?? true,
      deductFundExpenses: fees.deductFundExpenses ?? true,
      deductCarriedInterest: fees.deductCarriedInterest ?? true,
      grossExcludes: fees.grossExcludes ?? DEFAULT_METHODOLOGY.fees.grossExcludes,
    },
    cashFlowTiming: row.cash_flow_timing ?? "actual_dated",
    annualization: row.annualization ?? "annualize_over_one_year",
    rounding: "basis_points",
    capitalDefinition: row.capital_definition === "commitment" ? "commitment" : "paid_in",
    benchmark: row.benchmark_methodology?.name ? row.benchmark_methodology : null,
    effectiveFrom: String(row.effective_from ?? "2000-01-01"),
    effectiveTo: row.effective_to ? String(row.effective_to) : null,
  };
}

export async function saveMethodology(
  userId: string,
  input: {
    offeringId: string;
    label: string;
    fundType: FundType;
    calculationMethod?: "capital_flows" | "time_weighted" | "both";
    metrics?: string[];
    deductManagementFees?: boolean;
    deductFundExpenses?: boolean;
    deductCarriedInterest?: boolean;
    cashFlowTiming?: string;
    annualization?: string;
    capitalDefinition?: "paid_in" | "commitment";
    benchmark?: { name: string; source: string; methodology: string } | null;
    effectiveFrom: string;
    notes?: string;
  },
) {
  await assertHarmonious(userId);
  await authorizeFund(userId, input.offeringId);
  if (!isFundType(input.fundType)) fail("Unknown fund type.");
  const book = await ledgerBookForOffering(userId, input.offeringId);

  const { data: prior } = await db()
    .from("performance_methodologies")
    .select("id, version, effective_from")
    .eq("offering_id", input.offeringId)
    .order("version", { ascending: false })
    .limit(1);
  const previous = (prior ?? [])[0] ?? null;

  // A new version never rewrites the one published reports already used.
  if (previous) {
    await db()
      .from("performance_methodologies")
      .update({ effective_to: input.effectiveFrom, status: "retired" })
      .eq("id", previous.id)
      .is("effective_to", null);
  }

  const { data, error } = await db()
    .from("performance_methodologies")
    .insert({
      book_id: book.id,
      offering_id: input.offeringId,
      version: previous ? Number(previous.version) + 1 : 1,
      label: input.label,
      fund_type: input.fundType,
      calculation_method: input.calculationMethod ?? "capital_flows",
      metrics: input.metrics ?? FUND_TYPE_METRICS[input.fundType],
      fee_treatment: {
        deductManagementFees: input.deductManagementFees ?? true,
        deductFundExpenses: input.deductFundExpenses ?? true,
        deductCarriedInterest: input.deductCarriedInterest ?? true,
        grossExcludes: DEFAULT_METHODOLOGY.fees.grossExcludes,
      },
      carry_treatment: { deduct: input.deductCarriedInterest ?? true },
      expense_treatment: { deduct: input.deductFundExpenses ?? true },
      cash_flow_timing: input.cashFlowTiming ?? "actual_dated",
      annualization: input.annualization ?? "annualize_over_one_year",
      capital_definition: input.capitalDefinition ?? "paid_in",
      benchmark_methodology: input.benchmark ?? {},
      effective_from: input.effectiveFrom,
      notes: input.notes ?? null,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  return data;
}

export async function listMethodologies(userId: string, offeringId: string) {
  await authorizeFund(userId, offeringId);
  const { data } = await db()
    .from("performance_methodologies")
    .select("*")
    .eq("offering_id", offeringId)
    .order("version", { ascending: false });
  return data ?? [];
}

// ------------------------------------------------------- source records

/** Approved or published NAV on or before a date. Never a later one. */
async function navAsOf(offeringId: string, onOrBefore: string, notAfterVersionOf?: string) {
  const { data } = await db()
    .from("nav_versions")
    .select(
      "id, version, status, as_of_date, period_start, net_asset_value_cents, contributions_cents, distributions_cents, realized_gain_cents, unrealized_gain_cents, investment_income_cents, fund_expenses_cents, management_fee_cents, carried_interest_cents, units_outstanding, nav_per_unit_cents, capital_handoff, valuation_versions",
    )
    .eq("offering_id", offeringId)
    .in("status", ["approved", "published"])
    .lte("as_of_date", onOrBefore)
    .order("as_of_date", { ascending: false })
    .order("version", { ascending: false })
    .limit(5);
  const rows = (data ?? []) as any[];
  const filtered = notAfterVersionOf ? rows.filter((r) => r.as_of_date <= notAfterVersionOf) : rows;
  return filtered[0] ?? null;
}

async function navsWithin(offeringId: string, from: string, to: string) {
  const { data } = await db()
    .from("nav_versions")
    .select("id, version, status, as_of_date, net_asset_value_cents")
    .eq("offering_id", offeringId)
    .in("status", ["approved", "published"])
    .gte("as_of_date", from)
    .lte("as_of_date", to)
    .order("as_of_date", { ascending: true });
  const best = new Map<string, any>();
  for (const row of (data ?? []) as any[]) {
    const current = best.get(row.as_of_date);
    if (!current || Number(row.version) > Number(current.version)) best.set(row.as_of_date, row);
  }
  return [...best.values()].sort((a, b) => String(a.as_of_date).localeCompare(String(b.as_of_date)));
}

async function finalizedAllocationRun(offeringId: string, periodEnd: string) {
  const { data } = await db()
    .from("allocation_runs")
    .select("id, version, status, period_start, period_end, fund_totals, allocated_totals, nav_version_id")
    .eq("offering_id", offeringId)
    .eq("period_end", periodEnd)
    .eq("status", "finalized")
    .order("version", { ascending: false })
    .limit(1);
  return (data ?? [])[0] ?? null;
}

async function allocationLinesFor(runId: string) {
  const { data } = await db().from("allocation_lines").select("*").eq("run_id", runId);
  return (data ?? []) as any[];
}

async function positionsFor(offeringId: string) {
  const { data } = await db()
    .from("investor_positions")
    .select("id, offering_id, investor_user_id, investment_profile_id, display_name, capacity, is_gp, status")
    .eq("offering_id", offeringId);
  return (data ?? []) as any[];
}

const CONTRIBUTION_EVENTS = new Set(["contribution", "contribution_settled", "transfer_in"]);
const DISTRIBUTION_EVENTS = new Set([
  "distribution",
  "return_of_capital",
  "withdrawal",
  "transfer_out",
]);

/** Dated capital movements from the immutable commitment ledger. */
async function commitmentFlows(offeringId: string, onOrBefore: string) {
  const { data } = await db()
    .from("commitment_events")
    .select("id, position_id, event_type, amount_cents, effective_date, source, payment_id")
    .eq("offering_id", offeringId)
    .lte("effective_date", onOrBefore)
    .order("effective_date", { ascending: true });
  return ((data ?? []) as any[]).filter(
    (e) => CONTRIBUTION_EVENTS.has(e.event_type) || DISTRIBUTION_EVENTS.has(e.event_type),
  );
}

function toDatedFlow(event: any): DatedCashFlow {
  const date = String(event.effective_date);
  const amount = Math.abs(num(event.amount_cents));
  return CONTRIBUTION_EVENTS.has(event.event_type)
    ? contributionFlow(date, amount, `commitment_event:${event.event_type}`, event.id)
    : distributionFlow(date, amount, `commitment_event:${event.event_type}`, event.id);
}

// -------------------------------------------------------- the calculation

export interface PerformanceCalculation {
  offeringId: string;
  bookId: string;
  fundType: FundType;
  periodKind: PeriodKind;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  sourceCutoffAt: string;
  methodologyId: string | null;
  methodology: PerformanceMethodology;
  navVersionId: string | null;
  beginningNavVersionId: string | null;
  allocationRunId: string | null;
  fund: Record<string, number>;
  bridge: ReturnType<typeof performanceBridge>;
  returns: ReturnType<typeof grossAndNetReturn>;
  irr: ReturnType<typeof xirr>;
  twr: ReturnType<typeof timeWeightedReturn>;
  multiples: ReturnType<typeof multipleOnInvestedCapital>;
  privateMultiples: ReturnType<typeof privateMarketMultiples>;
  cumulativeReturnBps: number | null;
  cashFlows: DatedCashFlow[];
  investors: ReturnType<typeof investorPerformance>[];
  investorRows: any[];
  exceptions: PerformanceException[];
  benchmarks: BenchmarkEntry[];
  metrics: string[];
  priorRunId: string | null;
  inputsSnapshot: Record<string, unknown>;
}

/**
 * Calculate — but do not persist — fund and investor performance for a period.
 * Every figure comes from an approved NAV, a finalized allocation run or the
 * immutable commitment ledger.
 */
export async function calculatePerformance(
  userId: string,
  input: { offeringId: string; periodKind: PeriodKind; periodEnd: string; periodStart?: string },
): Promise<PerformanceCalculation> {
  await authorizeFund(userId, input.offeringId);
  if (!isPeriodKind(input.periodKind)) fail("Unknown reporting period.");
  const book = await ledgerBookForOffering(userId, input.offeringId);
  const config = await fundPerformanceConfig(input.offeringId, book.id);
  const fundType: FundType = isFundType(String(config.fund_type)) ? config.fund_type : "spv";

  const { data: firstEvent } = await db()
    .from("commitment_events")
    .select("effective_date")
    .eq("offering_id", input.offeringId)
    .order("effective_date", { ascending: true })
    .limit(1);
  const inception = (firstEvent ?? [])[0]?.effective_date ?? null;

  const bounds = periodBounds(input.periodKind, input.periodEnd, {
    inception,
    periodStart: input.periodStart ?? null,
  });

  const { id: methodologyId, methodology } = await methodologyFor(
    input.offeringId,
    book.id,
    fundType,
    bounds.periodEnd,
  );

  const endingNav = await navAsOf(input.offeringId, bounds.periodEnd);
  const beginningNav = await navAsOf(
    input.offeringId,
    new Date(Date.parse(`${bounds.periodStart}T00:00:00Z`) - 86400000).toISOString().slice(0, 10),
  );

  const allocationRun = await finalizedAllocationRun(input.offeringId, bounds.periodEnd);
  const lines = allocationRun ? await allocationLinesFor(allocationRun.id) : [];
  const positions = await positionsFor(input.offeringId);
  const positionById = new Map(positions.map((p) => [p.id, p]));

  // Fund period activity: the finalized allocation run's fund totals are
  // authoritative when they exist, otherwise the approved NAV's own figures.
  const totals = (allocationRun?.fund_totals ?? {}) as Record<string, unknown>;
  const pick = (key: string, navKey: string) =>
    totals[key] !== undefined ? num(totals[key]) : num(endingNav?.[navKey]);

  const fund = {
    beginningValueCents: num(beginningNav?.net_asset_value_cents),
    endingValueCents: num(endingNav?.net_asset_value_cents),
    contributionsCents: pick("contributionsCents", "contributions_cents"),
    distributionsCents: pick("distributionsCents", "distributions_cents"),
    investmentIncomeCents: pick("netIncomeCents", "investment_income_cents"),
    realizedGainCents: pick("realizedGainCents", "realized_gain_cents"),
    unrealizedGainCents: pick("unrealizedGainCents", "unrealized_gain_cents"),
    managementFeesCents: pick("managementFeesCents", "management_fee_cents"),
    expensesCents: pick("fundExpensesCents", "fund_expenses_cents"),
    carriedInterestCents: pick("carriedInterestCents", "carried_interest_cents"),
  };

  const bridge = performanceBridge({ ...fund, endingValueCents: fund.endingValueCents });
  const returns = grossAndNetReturn(fund, methodology.fees);

  // Dated fund cash flows for the period, bounded by the opening value and
  // the approved ending value.
  const allFlows = await commitmentFlows(input.offeringId, bounds.periodEnd);
  const periodEvents = allFlows.filter((e) => String(e.effective_date) >= bounds.periodStart);
  const cashFlows: DatedCashFlow[] = [];
  if (fund.beginningValueCents > 0) {
    cashFlows.push(
      contributionFlow(
        bounds.periodStart,
        fund.beginningValueCents,
        "nav_version:opening_value",
        beginningNav?.id ?? null,
      ),
    );
  }
  for (const event of periodEvents) cashFlows.push(toDatedFlow(event));
  cashFlows.push(
    terminalFlow(bounds.periodEnd, fund.endingValueCents, "nav_version:ending_value"),
  );
  const irr = xirr(cashFlows);

  // Time-weighted return across subperiods bounded by approved interim values.
  const interim = (await navsWithin(input.offeringId, bounds.periodStart, bounds.periodEnd)).filter(
    (n) => String(n.as_of_date) < bounds.periodEnd,
  );
  const marks = [
    { date: bounds.periodStart, valueCents: fund.beginningValueCents },
    ...interim.map((n) => ({ date: String(n.as_of_date), valueCents: num(n.net_asset_value_cents) })),
    { date: bounds.periodEnd, valueCents: fund.endingValueCents },
  ];
  const subperiods: Subperiod[] = [];
  for (let i = 0; i < marks.length - 1; i += 1) {
    const from = marks[i]!;
    const to = marks[i + 1]!;
    const flow = periodEvents
      .filter((e) => String(e.effective_date) > from.date && String(e.effective_date) <= to.date)
      .reduce(
        (sum, e) =>
          sum +
          (CONTRIBUTION_EVENTS.has(e.event_type)
            ? Math.abs(num(e.amount_cents))
            : -Math.abs(num(e.amount_cents))),
        0,
      );
    subperiods.push({
      start: from.date,
      end: to.date,
      beginningValueCents: from.valueCents,
      externalFlowCents: flow,
      endingValueCents: to.valueCents,
    });
  }
  const twr = timeWeightedReturn(subperiods);

  // Since-inception capital measures, always against paid-in capital.
  const paidInCents = allFlows
    .filter((e) => CONTRIBUTION_EVENTS.has(e.event_type))
    .reduce((s, e) => s + Math.abs(num(e.amount_cents)), 0);
  const lifetimeDistributionsCents = allFlows
    .filter((e) => DISTRIBUTION_EVENTS.has(e.event_type))
    .reduce((s, e) => s + Math.abs(num(e.amount_cents)), 0);

  const multiples = multipleOnInvestedCapital({
    investedCapitalCents: paidInCents,
    realizedValueCents: lifetimeDistributionsCents,
    remainingValueCents: fund.endingValueCents,
    capitalDefinition: methodology.capitalDefinition,
  });
  const privateMultiples = privateMarketMultiples({
    paidInCapitalCents: paidInCents,
    distributionsCents: lifetimeDistributionsCents,
    residualValueCents: fund.endingValueCents,
    capitalDefinition: methodology.capitalDefinition,
  });
  const cumulativeReturnBps =
    paidInCents > 0
      ? Math.round(
          ((lifetimeDistributionsCents + fund.endingValueCents - paidInCents) / paidInCents) * 10000,
        )
      : null;

  // ---- investor level, each position on its own records
  const eventsByPosition = new Map<string, any[]>();
  for (const event of allFlows) {
    const list = eventsByPosition.get(event.position_id) ?? [];
    list.push(event);
    eventsByPosition.set(event.position_id, list);
  }

  const investors = lines.map((line) => {
    const position = positionById.get(line.position_id) ?? {};
    const own = eventsByPosition.get(line.position_id) ?? [];
    const ownPaidIn = own
      .filter((e) => CONTRIBUTION_EVENTS.has(e.event_type))
      .reduce((s, e) => s + Math.abs(num(e.amount_cents)), 0);
    const ownDistributed = own
      .filter((e) => DISTRIBUTION_EVENTS.has(e.event_type))
      .reduce((s, e) => s + Math.abs(num(e.amount_cents)), 0);

    const flows: DatedCashFlow[] = own.map(toDatedFlow);
    flows.push(
      terminalFlow(bounds.periodEnd, num(line.ending_capital_cents), "capital_account:ending_capital"),
    );

    return investorPerformance(
      {
        positionId: line.position_id,
        displayName: position.display_name ?? "Investor",
        capacity: position.capacity ?? "individual",
        beginningCapitalCents: num(line.beginning_capital_cents),
        contributionsCents: num(line.contributions_cents),
        distributionsCents: num(line.distributions_cents),
        allocatedIncomeCents: num(line.allocated_income_cents) - num(line.allocated_loss_cents),
        realizedGainCents: num(line.realized_gain_cents),
        unrealizedGainCents: num(line.unrealized_gain_cents),
        feesCents: num(line.management_fees_cents),
        expensesCents: num(line.fund_expenses_cents),
        carryCents: num(line.carried_interest_cents),
        endingCapitalCents: num(line.ending_capital_cents),
        paidInCapitalCents: ownPaidIn,
        commitmentCents: num(line.commitment_cents),
        cashFlows: flows,
        lifetimeDistributionsCents: ownDistributed,
      },
      methodology,
    );
  });

  const tie = investorTotalsTie(
    lines.map((l) => ({ endingCapitalCents: num(l.ending_capital_cents) })),
    fund.endingValueCents,
  );

  const { data: priorRunRow } = await db()
    .from("performance_runs")
    .select("id, net_return_bps, period_end, status")
    .eq("offering_id", input.offeringId)
    .lt("period_end", bounds.periodStart)
    .in("status", ["published", "superseded", "approved"])
    .order("period_end", { ascending: false })
    .limit(1);
  const priorRun = (priorRunRow ?? [])[0] ?? null;

  const { data: benchmarkRows } = await db()
    .from("performance_benchmarks")
    .select("*")
    .eq("offering_id", input.offeringId)
    .is("run_id", null)
    .lte("period_end", bounds.periodEnd);
  const benchmarks = ((benchmarkRows ?? []) as any[]).map((b) =>
    normaliseBenchmark(
      {
        name: b.name,
        source: b.source,
        methodology: b.methodology ?? "",
        periodStart: String(b.period_start),
        periodEnd: String(b.period_end),
        returnBps: b.return_bps ?? null,
        asOf: b.as_of ?? null,
        note: b.note ?? null,
      },
      bounds,
    ),
  );

  const sourceCutoffAt = nowIso();
  const exceptions = [
    ...performanceExceptions({
      beginningNavFound: Boolean(beginningNav) || bounds.periodStart === inception,
      endingNavFound: Boolean(endingNav),
      allocationFinalized: Boolean(allocationRun),
      bridge,
      irr,
      methodologyFound: Boolean(methodologyId),
      sourceCutoffAt,
      periodEnd: bounds.periodEnd,
      investorEndingTotalCents: allocationRun ? tie.totalCents : null,
      fundEndingValueCents: fund.endingValueCents,
      priorNetReturnBps: priorRun?.net_return_bps ?? null,
      netReturnBps: returns.netReturnBps,
      largeMovementThresholdBps: Number(config.large_movement_threshold_bps ?? 5000),
      benchmarksRequested: Boolean(methodology.benchmark),
      benchmarksAvailable: benchmarks.some((b) => b.valueStatus === "provided"),
      blockingKinds: config.blocking_exception_kinds ?? [],
    }),
    ...investors.flatMap((i) => i.exceptions),
  ];

  return {
    offeringId: input.offeringId,
    bookId: book.id,
    fundType,
    periodKind: input.periodKind,
    periodStart: bounds.periodStart,
    periodEnd: bounds.periodEnd,
    periodLabel: bounds.label,
    sourceCutoffAt,
    methodologyId,
    methodology,
    navVersionId: endingNav?.id ?? null,
    beginningNavVersionId: beginningNav?.id ?? null,
    allocationRunId: allocationRun?.id ?? null,
    fund,
    bridge,
    returns,
    irr,
    twr,
    multiples,
    privateMultiples,
    cumulativeReturnBps,
    cashFlows,
    investors,
    investorRows: lines.map((line) => ({ line, position: positionById.get(line.position_id) ?? null })),
    exceptions,
    benchmarks,
    metrics: metricsForFund(fundType, config.enabled_metrics ?? []),
    priorRunId: priorRun?.id ?? null,
    inputsSnapshot: {
      navVersion: endingNav
        ? { id: endingNav.id, version: endingNav.version, asOf: endingNav.as_of_date }
        : null,
      beginningNavVersion: beginningNav
        ? { id: beginningNav.id, version: beginningNav.version, asOf: beginningNav.as_of_date }
        : null,
      allocationRun: allocationRun
        ? { id: allocationRun.id, version: allocationRun.version, periodEnd: allocationRun.period_end }
        : null,
      valuationVersions: endingNav?.valuation_versions ?? [],
      paidInCapitalCents: paidInCents,
      lifetimeDistributionsCents,
      investorTotalsTie: tie,
      cashFlowCount: cashFlows.length,
      inception,
    },
  };
}

// ---------------------------------------------------------- persistence

const bps = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v));

/** Prepare a period: Harmonious only, and a draft is refreshed rather than stacked. */
export async function preparePerformance(
  userId: string,
  input: { offeringId: string; periodKind: PeriodKind; periodEnd: string; periodStart?: string },
) {
  await assertHarmonious(userId);
  const calc = await calculatePerformance(userId, input);

  const { data: existingRows } = await db()
    .from("performance_runs")
    .select("id, status, version")
    .eq("offering_id", calc.offeringId)
    .eq("period_kind", calc.periodKind)
    .eq("period_start", calc.periodStart)
    .eq("period_end", calc.periodEnd)
    .order("version", { ascending: false });
  const existing = (existingRows ?? []) as any[];
  const reusable = existing.find((r) => ["draft", "prepared"].includes(String(r.status)));
  const latestVersion = existing[0]?.version ?? 0;

  const payload = {
    book_id: calc.bookId,
    offering_id: calc.offeringId,
    period_kind: calc.periodKind,
    period_start: calc.periodStart,
    period_end: calc.periodEnd,
    period_label: calc.periodLabel,
    source_cutoff_at: calc.sourceCutoffAt,
    fund_type: calc.fundType,
    methodology_id: calc.methodologyId,
    methodology_version: calc.methodology.version,
    methodology_snapshot: calc.methodology as unknown as Record<string, unknown>,
    nav_version_id: calc.navVersionId,
    beginning_nav_version_id: calc.beginningNavVersionId,
    allocation_run_id: calc.allocationRunId,
    prior_run_id: calc.priorRunId,
    beginning_value_cents: calc.fund.beginningValueCents,
    ending_value_cents: calc.fund.endingValueCents,
    contributions_cents: calc.fund.contributionsCents,
    distributions_cents: calc.fund.distributionsCents,
    investment_income_cents: calc.fund.investmentIncomeCents,
    realized_gain_cents: calc.fund.realizedGainCents,
    unrealized_gain_cents: calc.fund.unrealizedGainCents,
    expenses_cents: calc.fund.expensesCents,
    management_fees_cents: calc.fund.managementFeesCents,
    carried_interest_cents: calc.fund.carriedInterestCents,
    paid_in_capital_cents: calc.multiples.investedCapitalCents,
    realized_value_cents: calc.multiples.realizedValueCents,
    remaining_value_cents: calc.multiples.remainingValueCents,
    total_value_cents: calc.multiples.totalValueCents,
    gross_return_bps: bps(calc.returns.grossReturnBps),
    net_return_bps: bps(calc.returns.netReturnBps),
    irr_bps: calc.irr.bps,
    irr_status: calc.irr.status,
    twr_bps: calc.twr.bps,
    twr_status: calc.twr.status,
    cumulative_return_bps: calc.cumulativeReturnBps,
    moic: calc.multiples.moic,
    dpi: calc.privateMultiples.dpi,
    rvpi: calc.privateMultiples.rvpi,
    tvpi: calc.privateMultiples.tvpi,
    bridge: calc.bridge as unknown as Record<string, unknown>,
    cash_flows: calc.cashFlows,
    subperiods: calc.twr.subperiods,
    metrics: { enabled: calc.metrics, returns: calc.returns },
    inputs_snapshot: calc.inputsSnapshot,
    exceptions: calc.exceptions,
    benchmarks: calc.benchmarks,
    status: "prepared",
    prepared_by: userId,
    prepared_at: nowIso(),
    updated_at: nowIso(),
  };

  let runId: string;
  if (reusable) {
    const { data, error } = await db()
      .from("performance_runs")
      .update(payload)
      .eq("id", reusable.id)
      .select("id")
      .single();
    if (error) fail(error.message);
    runId = data.id;
    await db().from("performance_lines").delete().eq("run_id", runId);
  } else {
    const { data, error } = await db()
      .from("performance_runs")
      .insert({ ...payload, version: Number(latestVersion) + 1 })
      .select("id")
      .single();
    if (error) fail(error.message);
    runId = data.id;
  }

  if (calc.investors.length > 0) {
    const rowByPosition = new Map(calc.investorRows.map((r) => [r.line.position_id, r]));
    const inserts = calc.investors.map((investor) => {
      const source = rowByPosition.get(investor.positionId);
      const line = source?.line ?? {};
      const position = source?.position ?? {};
      return {
        run_id: runId,
        offering_id: calc.offeringId,
        position_id: investor.positionId,
        investment_profile_id: position.investment_profile_id ?? null,
        investor_user_id: position.investor_user_id ?? null,
        display_name: investor.displayName,
        capacity: investor.capacity,
        is_gp: Boolean(position.is_gp),
        beginning_capital_cents: num(line.beginning_capital_cents),
        contributions_cents: num(line.contributions_cents),
        distributions_cents: num(line.distributions_cents),
        allocated_income_cents: num(line.allocated_income_cents) - num(line.allocated_loss_cents),
        realized_gain_cents: num(line.realized_gain_cents),
        unrealized_gain_cents: num(line.unrealized_gain_cents),
        fees_cents: num(line.management_fees_cents),
        expenses_cents: num(line.fund_expenses_cents),
        carry_cents: num(line.carried_interest_cents),
        ending_capital_cents: num(line.ending_capital_cents),
        paid_in_capital_cents: investor.multiples.investedCapitalCents,
        commitment_cents: num(line.commitment_cents),
        unfunded_commitment_cents: num(line.unfunded_commitment_cents),
        realized_value_cents: investor.multiples.realizedValueCents,
        remaining_value_cents: investor.multiples.remainingValueCents,
        total_value_cents: investor.multiples.totalValueCents,
        gross_return_bps: bps(investor.returns.grossReturnBps),
        net_return_bps: bps(investor.returns.netReturnBps),
        irr_bps: investor.irr.bps,
        irr_status: investor.irr.status,
        moic: investor.multiples.moic,
        dpi: investor.privateMultiples.dpi,
        rvpi: investor.privateMultiples.rvpi,
        tvpi: investor.privateMultiples.tvpi,
        cash_flows: investor.irr.flows,
        bridge: investor.bridge as unknown as Record<string, unknown>,
        exceptions: investor.exceptions,
        inputs: { allocationLineId: line.id ?? null, methodology: calc.methodology.version },
      };
    });
    const { error } = await db().from("performance_lines").insert(inserts);
    if (error) fail(error.message);
  }

  await recordEvent(runId, calc.offeringId, "prepared", userId, null, "prepared", {
    exceptions: calc.exceptions.length,
  });

  return { runId, calculation: calc };
}

async function recordEvent(
  runId: string,
  offeringId: string,
  eventType: string,
  actorId: string,
  from: string | null,
  to: string | null,
  detail: Record<string, unknown> = {},
) {
  await db().from("performance_events").insert({
    run_id: runId,
    offering_id: offeringId,
    event_type: eventType,
    from_status: from,
    to_status: to,
    actor_id: actorId,
    detail,
  });
}

/** Move a run along its lifecycle. Harmonious only, and never by one person alone. */
export async function advancePerformanceRun(
  userId: string,
  runId: string,
  to: PerformanceStatus,
  reason?: string,
) {
  const { run } = await authorizeRun(userId, runId);
  const from = run.status as PerformanceStatus;
  if (!canTransitionPerformance(from, to)) fail(`A ${from} performance report cannot move to ${to}.`);
  await assertHarmonious(userId);

  const actors = {
    preparedBy: run.prepared_by ?? null,
    reviewedBy: run.reviewed_by ?? null,
    approvedBy: run.approved_by ?? null,
    publishedBy: run.published_by ?? null,
  };

  if (to === "review" || to === "approved") {
    const problem = segregationError(actors, to === "review" ? "review" : "approve", userId);
    if (problem) fail(problem);
  }

  if (to === "published") {
    const blockers = publicationBlockers({
      status: from,
      exceptions: (run.exceptions ?? []) as PerformanceException[],
    });
    if (blockers.length > 0) fail(blockers[0]!);
    const missing = missingPerformanceProvenance({
      ...run,
      published_by: userId,
    });
    if (missing.length > 0) fail(`Publication provenance is incomplete: ${missing.join(", ")}.`);
  }

  const now = nowIso();
  const patch: Record<string, unknown> = { status: to, updated_at: now };
  if (to === "prepared") Object.assign(patch, { prepared_by: userId, prepared_at: now });
  if (to === "review") Object.assign(patch, { reviewed_by: userId, reviewed_at: now });
  if (to === "approved") Object.assign(patch, { approved_by: userId, approved_at: now });
  if (to === "published") {
    Object.assign(patch, { published_by: userId, published_at: now, manager_visible: true });
  }
  if (reason) patch['revision_reason'] = reason;

  const { data, error } = await db()
    .from("performance_runs")
    .update(patch)
    .eq("id", runId)
    .eq("status", from)
    .select("*")
    .single();
  if (error) fail(error.message);

  if (to === "published") {
    if (run.supersedes_id) {
      await db()
        .from("performance_runs")
        .update({ status: "superseded", superseded_by_id: runId })
        .eq("id", run.supersedes_id)
        .eq("status", "published");
    }
    const registered = await registerReport(userId, {
      bookId: run.book_id,
      reportType: "performance" as any,
      periodStart: run.period_start,
      periodEnd: run.period_end,
      navVersionId: run.nav_version_id,
      methodologyVersion: run.methodology_version,
      accountingSnapshot: run.inputs_snapshot ?? {},
      payload: {
        performanceRunId: runId,
        periodLabel: run.period_label,
        grossReturnBps: run.gross_return_bps,
        netReturnBps: run.net_return_bps,
        irrBps: run.irr_bps,
        irrStatus: run.irr_status,
        moic: run.moic,
        dpi: run.dpi,
        rvpi: run.rvpi,
        tvpi: run.tvpi,
      },
    });
    await db().from("performance_runs").update({ report_id: registered.id }).eq("id", runId);
  }

  await recordEvent(runId, run.offering_id, "status_change", userId, from, to, {
    ...(reason ? { reason } : {}),
  });
  return data;
}

/** A published report is corrected by a new version, never by rewriting it. */
export async function revisePerformanceRun(userId: string, runId: string, reason: string) {
  await assertHarmonious(userId);
  if (!reason || reason.trim().length < 10) {
    fail("Please record why the published performance is being amended.");
  }
  const { run } = await authorizeRun(userId, runId);
  if (run.status !== "published") fail("Only a published performance report can be amended.");

  const prepared = await preparePerformance(userId, {
    offeringId: run.offering_id,
    periodKind: run.period_kind as PeriodKind,
    periodEnd: run.period_end,
    periodStart: run.period_start,
  });
  const { error } = await db()
    .from("performance_runs")
    .update({ supersedes_id: runId, revision_reason: reason, updated_at: nowIso() })
    .eq("id", prepared.runId);
  if (error) fail(error.message);

  await recordEvent(prepared.runId, run.offering_id, "amendment_started", userId, null, "prepared", {
    supersedes: runId,
    reason,
  });
  return { runId: prepared.runId, supersedes: runId };
}

/** Managers may acknowledge or challenge; they never author a figure. */
export async function managerRespondToPerformance(
  userId: string,
  runId: string,
  response: "acknowledged" | "challenged",
  note?: string,
) {
  const { run } = await authorizeRun(userId, runId);
  if (!["published", "superseded"].includes(String(run.status))) {
    fail("Performance can only be acknowledged once it is published.");
  }
  if (response === "challenged" && (!note || note.trim().length < 10)) {
    fail("Please describe what looks wrong so it can be investigated.");
  }
  const { data, error } = await db()
    .from("performance_runs")
    .update({
      manager_response: response,
      manager_note: note ?? null,
      manager_responded_by: userId,
      manager_responded_at: nowIso(),
    })
    .eq("id", runId)
    .select("id, manager_response, manager_note")
    .single();
  if (error) fail(error.message);
  await recordEvent(runId, run.offering_id, `manager_${response}`, userId, null, null, {
    ...(note ? { note } : {}),
  });
  return data;
}

export async function setPerformanceVisibility(
  userId: string,
  runId: string,
  input: { managerVisible?: boolean; investorVisible?: boolean },
) {
  await assertHarmonious(userId);
  const { run } = await authorizeRun(userId, runId);
  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (input.managerVisible !== undefined) patch['manager_visible'] = input.managerVisible;
  if (input.investorVisible !== undefined) patch['investor_visible'] = input.investorVisible;
  const { data, error } = await db()
    .from("performance_runs")
    .update(patch)
    .eq("id", runId)
    .select("id, manager_visible, investor_visible")
    .single();
  if (error) fail(error.message);
  await recordEvent(runId, run.offering_id, "visibility_changed", userId, null, null, patch);
  return data;
}

// -------------------------------------------------------------- benchmarks

export async function saveBenchmark(
  userId: string,
  input: {
    offeringId: string;
    name: string;
    source: string;
    methodology?: string;
    periodStart: string;
    periodEnd: string;
    returnBps?: number | null;
    note?: string;
  },
) {
  await assertHarmonious(userId);
  await authorizeFund(userId, input.offeringId);
  const { data, error } = await db()
    .from("performance_benchmarks")
    .insert({
      offering_id: input.offeringId,
      name: input.name,
      source: input.source,
      methodology: input.methodology ?? "",
      period_start: input.periodStart,
      period_end: input.periodEnd,
      return_bps: input.returnBps ?? null,
      value_status: input.returnBps === null || input.returnBps === undefined ? "unavailable" : "provided",
      as_of: nowIso(),
      note: input.note ?? null,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  return data;
}

// ------------------------------------------------------------ read models

export async function performanceQueue(userId: string, offeringId?: string) {
  const scope = await assertHarmonious(userId);
  let query = db()
    .from("performance_runs")
    .select("*")
    .order("period_end", { ascending: false })
    .limit(300);
  if (offeringId) {
    assertScopeAllows(scope, offeringId);
    query = query.eq("offering_id", offeringId);
  }
  const { data } = await query;
  const runs = (data ?? []) as any[];

  const { data: offerings } = await db().from("offerings").select("id, name");
  const nameById = new Map(((offerings ?? []) as any[]).map((o) => [o.id, o.name]));
  const decorated = runs.map((r) => ({ ...r, fundName: nameById.get(r.offering_id) ?? "Fund" }));

  return {
    funds: ((offerings ?? []) as any[]).map((o) => ({ id: o.id, name: o.name })),
    awaitingPreparation: decorated.filter((r) => r.status === "draft"),
    awaitingReview: decorated.filter((r) => r.status === "prepared"),
    awaitingApproval: decorated.filter((r) => r.status === "review"),
    readyToPublish: decorated.filter((r) => r.status === "approved"),
    published: decorated.filter((r) => r.status === "published"),
    superseded: decorated.filter((r) => r.status === "superseded"),
    challenges: decorated.filter((r) => r.manager_response === "challenged"),
    exceptions: decorated.filter(
      (r) => blockingPerformanceExceptions((r.exceptions ?? []) as PerformanceException[]).length > 0,
    ),
  };
}

export async function managerPerformance(userId: string, offeringId?: string) {
  const scope = await reviewerScope(userId);
  const ids = offeringId ? [offeringId] : scope.offeringIds;
  if (offeringId) assertScopeAllows(scope, offeringId);
  if (!scope.isAdmin && ids.length === 0) return { funds: [], runs: [] };

  let query = db()
    .from("performance_runs")
    .select("*")
    .in("status", ["published", "superseded"])
    .eq("manager_visible", true)
    .order("period_end", { ascending: false })
    .limit(200);
  if (!scope.isAdmin || offeringId) query = query.in("offering_id", ids);
  const { data } = await query;

  const runs = (data ?? []) as any[];
  const { data: offerings } = await db()
    .from("offerings")
    .select("id, name")
    .in("id", runs.length > 0 ? [...new Set(runs.map((r) => r.offering_id))] : ["00000000-0000-0000-0000-000000000000"]);
  const nameById = new Map(((offerings ?? []) as any[]).map((o) => [o.id, o.name]));
  return {
    funds: ((offerings ?? []) as any[]).map((o) => ({ id: o.id, name: o.name })),
    runs: runs.map((r) => ({ ...r, fundName: nameById.get(r.offering_id) ?? "Fund" })),
  };
}

/**
 * What one investor may see: their own positions only, from published,
 * investor-visible reports, with the fund-level view kept clearly separate.
 */
export async function investorPerformanceView(userId: string) {
  const { data: lines } = await db()
    .from("performance_lines")
    .select("*")
    .eq("investor_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(400);
  const rows = (lines ?? []) as any[];
  if (rows.length === 0) return { investments: [] };

  const { data: runs } = await db()
    .from("performance_runs")
    .select(
      "id, offering_id, period_kind, period_start, period_end, period_label, status, version, investor_visible, methodology_version, fund_type, net_return_bps, gross_return_bps, irr_bps, irr_status, moic, dpi, rvpi, tvpi, ending_value_cents, published_at",
    )
    .in("id", [...new Set(rows.map((r) => r.run_id))]);
  const runById = new Map(
    ((runs ?? []) as any[])
      .filter((r) => r.investor_visible && ["published", "superseded"].includes(String(r.status)))
      .map((r) => [r.id, r]),
  );

  const visible = rows.filter((r) => runById.has(r.run_id));
  if (visible.length === 0) return { investments: [] };

  const { data: offerings } = await db()
    .from("offerings")
    .select("id, name")
    .in("id", [...new Set(visible.map((r) => r.offering_id))]);
  const nameById = new Map(((offerings ?? []) as any[]).map((o) => [o.id, o.name]));

  const grouped = new Map<string, any>();
  for (const line of visible) {
    const run = runById.get(line.run_id);
    const key = `${line.offering_id}:${line.position_id}`;
    const entry =
      grouped.get(key) ??
      {
        offeringId: line.offering_id,
        fundName: nameById.get(line.offering_id) ?? "Fund",
        positionId: line.position_id,
        investmentProfileId: line.investment_profile_id,
        displayName: line.display_name,
        capacity: line.capacity,
        periods: [] as any[],
      };
    entry.periods.push({
      runId: run.id,
      periodLabel: run.period_label,
      periodStart: run.period_start,
      periodEnd: run.period_end,
      periodKind: run.period_kind,
      methodologyVersion: run.methodology_version,
      yourInvestment: {
        contributedCents: line.paid_in_capital_cents,
        currentValueCents: line.ending_capital_cents,
        distributionsCents: line.realized_value_cents,
        totalValueCents: line.total_value_cents,
        gainCents: line.total_value_cents - line.paid_in_capital_cents,
        netReturnBps: line.net_return_bps,
        grossReturnBps: line.gross_return_bps,
        irrBps: line.irr_bps,
        irrStatus: line.irr_status,
        moic: line.moic,
        dpi: line.dpi,
        rvpi: line.rvpi,
        tvpi: line.tvpi,
      },
      fundLevel: {
        netAssetsCents: run.ending_value_cents,
        netReturnBps: run.net_return_bps,
        irrBps: run.irr_bps,
        irrStatus: run.irr_status,
        moic: run.moic,
        tvpi: run.tvpi,
      },
    });
    grouped.set(key, entry);
  }

  return { investments: [...grouped.values()] };
}

/** Full detail for one run, including every investor line for staff. */
export async function performanceRunDetail(userId: string, runId: string) {
  const { run, scope } = await authorizeRun(userId, runId);
  if (!scope.isAdmin && !["published", "superseded"].includes(String(run.status))) {
    fail("This performance report has not been published yet.");
  }
  if (!scope.isAdmin && !run.manager_visible) {
    fail("This performance report has not been shared.");
  }

  const { data: lines } = await db()
    .from("performance_lines")
    .select("*")
    .eq("run_id", runId)
    .order("ending_capital_cents", { ascending: false });

  const { data: events } = scope.isAdmin
    ? await db().from("performance_events").select("*").eq("run_id", runId).order("created_at")
    : { data: [] };

  const { data: offering } = await db()
    .from("offerings")
    .select("id, name")
    .eq("id", run.offering_id)
    .maybeSingle();

  const prior = run.prior_run_id
    ? (
        await db()
          .from("performance_runs")
          .select("id, period_label, net_return_bps, irr_bps, moic, ending_value_cents")
          .eq("id", run.prior_run_id)
          .maybeSingle()
      ).data
    : null;

  return {
    run: { ...run, fundName: offering?.name ?? "Fund" },
    lines: lines ?? [],
    events: events ?? [],
    prior,
    isStaff: scope.isAdmin,
  };
}

/** Drill-down: where a single published figure came from. */
export async function performanceProvenance(userId: string, runId: string, metricKey: string) {
  const { run } = await authorizeRun(userId, runId);
  const snapshot = (run.inputs_snapshot ?? {}) as any;

  const nav = run.nav_version_id
    ? (
        await db()
          .from("nav_versions")
          .select("id, version, status, as_of_date, net_asset_value_cents, approved_at, published_at")
          .eq("id", run.nav_version_id)
          .maybeSingle()
      ).data
    : null;
  const beginningNav = run.beginning_nav_version_id
    ? (
        await db()
          .from("nav_versions")
          .select("id, version, status, as_of_date, net_asset_value_cents")
          .eq("id", run.beginning_nav_version_id)
          .maybeSingle()
      ).data
    : null;
  const allocation = run.allocation_run_id
    ? (
        await db()
          .from("allocation_runs")
          .select("id, version, status, period_start, period_end, fund_totals, finalized_at")
          .eq("id", run.allocation_run_id)
          .maybeSingle()
      ).data
    : null;

  return {
    metricKey,
    methodology: run.methodology_snapshot,
    methodologyVersion: run.methodology_version,
    sourceCutoffAt: run.source_cutoff_at,
    endingNav: nav,
    beginningNav,
    allocationRun: allocation,
    cashFlows: run.cash_flows ?? [],
    subperiods: run.subperiods ?? [],
    bridge: run.bridge ?? {},
    valuationVersions: snapshot.valuationVersions ?? [],
    exceptions: run.exceptions ?? [],
  };
}

export async function updatePerformanceConfig(
  userId: string,
  input: {
    offeringId: string;
    fundType?: FundType;
    enabledMetrics?: string[];
    defaultFrequency?: string;
    managerResponseEnabled?: boolean;
    investorReportingEnabled?: boolean;
    blockingExceptionKinds?: string[];
    largeMovementThresholdBps?: number;
  },
) {
  await assertHarmonious(userId);
  await authorizeFund(userId, input.offeringId);
  const book = await ledgerBookForOffering(userId, input.offeringId);
  await fundPerformanceConfig(input.offeringId, book.id);

  const patch: Record<string, unknown> = { updated_by: userId, updated_at: nowIso() };
  if (input.fundType) {
    if (!isFundType(input.fundType)) fail("Unknown fund type.");
    patch['fund_type'] = input.fundType;
  }
  if (input.enabledMetrics) patch['enabled_metrics'] = input.enabledMetrics;
  if (input.defaultFrequency) patch['default_frequency'] = input.defaultFrequency;
  if (input.managerResponseEnabled !== undefined) {
    patch['manager_response_enabled'] = input.managerResponseEnabled;
  }
  if (input.investorReportingEnabled !== undefined) {
    patch['investor_reporting_enabled'] = input.investorReportingEnabled;
  }
  if (input.blockingExceptionKinds) patch['blocking_exception_kinds'] = input.blockingExceptionKinds;
  if (input.largeMovementThresholdBps !== undefined) {
    patch['large_movement_threshold_bps'] = input.largeMovementThresholdBps;
  }

  const { data, error } = await db()
    .from("performance_configs")
    .update(patch)
    .eq("offering_id", input.offeringId)
    .select("*")
    .single();
  if (error) fail(error.message);
  return data;
}

export async function getPerformanceConfig(userId: string, offeringId: string) {
  await authorizeFund(userId, offeringId);
  const book = await ledgerBookForOffering(userId, offeringId);
  return fundPerformanceConfig(offeringId, book.id);
}
