/**
 * Server-only NAV engine.
 *
 * NAV is derived, never typed in: posted ledger balances up to the as-of date
 * plus the portfolio valuations that were effective on that date. Every
 * calculation stores an immutable snapshot of its inputs so the same number can
 * be reproduced after later ledger or valuation activity.
 *
 * Controls preserved here:
 *  - nothing trusts a fund, book or NAV id sent by the browser;
 *  - preparer ≠ approver, reviewer ≠ publisher, and no automated actor approves;
 *  - integrity failures (unbalanced ledger, unreconciled bridge, future
 *    valuations) can never be overridden;
 *  - a published NAV is never edited — revisions are new versions.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reviewerScope, assertScopeAllows, type ReviewerScope } from "@/lib/reviewer-authz.server";
import { ledgerBookForOffering, registerReport } from "@/lib/accounting.server";
import { valuationAsOf, type ValuationRecord } from "@/lib/valuation-model";
import {
  DEFAULT_NAV_POLICY,
  activityFromBalances,
  canPublish,
  canSubmitForReview,
  canTransitionNav,
  canOverride,
  capitalHandoff,
  managerMayNav,
  navBridge,
  navChange,
  navChecks,
  navPackage,
  periodBoundsFor,
  publicationBlockers,
  revisionImpact,
  segregationError,
  type LedgerBalance,
  type ManagerWorkflow,
  type NavCheck,
  type NavCheckCode,
  type NavFrequency,
  type NavOverride,
  type NavPolicy,
  type NavStatus,
} from "@/lib/nav-model";
import type { AccountSubtype, AccountType } from "@/lib/accounting-model";

const db = () => supabaseAdmin as any;

function fail(message: string): never {
  throw new Error(message);
}

const nowIso = () => new Date().toISOString();

async function assertHarmonious(userId: string): Promise<ReviewerScope> {
  const scope = await reviewerScope(userId);
  if (!scope.isAdmin) fail("Forbidden: Harmonious NAV authority required.");
  return scope;
}

async function recordEvent(entry: {
  navVersionId?: string | null;
  offeringId?: string | null;
  actorUserId: string | null;
  actorRole: string;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  reason?: string | null;
  payload?: Record<string, unknown>;
}) {
  await db().from("nav_events").insert({
    nav_version_id: entry.navVersionId ?? null,
    offering_id: entry.offeringId ?? null,
    actor_user_id: entry.actorUserId,
    actor_role: entry.actorRole,
    action: entry.action,
    from_status: entry.fromStatus ?? null,
    to_status: entry.toStatus ?? null,
    reason: entry.reason ?? null,
    payload: entry.payload ?? {},
  });
}

// -------------------------------------------------------------------- policy

export async function navPolicyFor(offeringId: string | null): Promise<NavPolicy> {
  if (!offeringId) return DEFAULT_NAV_POLICY;
  const { data } = await db()
    .from("nav_policies")
    .select("*")
    .eq("offering_id", offeringId)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return DEFAULT_NAV_POLICY;
  return {
    frequency: (data.frequency ?? "quarterly") as NavFrequency,
    unitAccounting: Boolean(data.unit_accounting),
    unreconciledCashToleranceCents: Number(data.unreconciled_cash_tolerance_cents),
    unpostedJournalToleranceCents: Number(data.unposted_journal_tolerance_cents),
    openItemToleranceCents: Number(data.open_item_tolerance_cents),
    valuationStalenessDays: Number(data.valuation_staleness_days),
    blockingChecks: Array.isArray(data.blocking_checks)
      ? (data.blocking_checks as NavCheckCode[])
      : DEFAULT_NAV_POLICY.blockingChecks,
    managerWorkflow: (data.manager_workflow ?? "acknowledge") as ManagerWorkflow,
    managerApprovalRequired: Boolean(data.manager_approval_required),
    methodologyVersion: data.methodology_version ?? "nav-v1",
  };
}

export async function saveNavPolicy(
  userId: string,
  input: {
    offeringId: string;
    frequency?: NavFrequency;
    unitAccounting?: boolean;
    unreconciledCashToleranceCents?: number;
    unpostedJournalToleranceCents?: number;
    openItemToleranceCents?: number;
    valuationStalenessDays?: number;
    blockingChecks?: NavCheckCode[];
    managerWorkflow?: ManagerWorkflow;
    managerApprovalRequired?: boolean;
  },
) {
  await assertHarmonious(userId);
  const book = await ledgerBookForOffering(userId, input.offeringId);
  const current = await navPolicyFor(input.offeringId);
  // Policy is versioned by retirement, never by rewriting history.
  await db()
    .from("nav_policies")
    .update({ is_active: false, updated_at: nowIso() })
    .eq("offering_id", input.offeringId)
    .eq("is_active", true);
  const { data, error } = await db()
    .from("nav_policies")
    .insert({
      offering_id: input.offeringId,
      book_id: book.id,
      frequency: input.frequency ?? current.frequency,
      unit_accounting: input.unitAccounting ?? current.unitAccounting,
      unreconciled_cash_tolerance_cents:
        input.unreconciledCashToleranceCents ?? current.unreconciledCashToleranceCents,
      unposted_journal_tolerance_cents:
        input.unpostedJournalToleranceCents ?? current.unpostedJournalToleranceCents,
      open_item_tolerance_cents: input.openItemToleranceCents ?? current.openItemToleranceCents,
      valuation_staleness_days: input.valuationStalenessDays ?? current.valuationStalenessDays,
      blocking_checks: input.blockingChecks ?? current.blockingChecks,
      manager_workflow: input.managerWorkflow ?? current.managerWorkflow,
      manager_approval_required:
        input.managerApprovalRequired ?? current.managerApprovalRequired,
      methodology_version: current.methodologyVersion,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  await recordEvent({
    offeringId: input.offeringId,
    actorUserId: userId,
    actorRole: "harmonious",
    action: "nav_policy_saved",
    payload: { policyId: data.id },
  });
  return data;
}

// ------------------------------------------------------------ ledger reading

type PostedLine = {
  accountId: string;
  debitCents: number;
  creditCents: number;
  entryDate: string;
  entryId: string;
};

async function chartFor(bookId: string) {
  const { data } = await db()
    .from("chart_of_accounts")
    .select("id, code, name, account_type, subtype")
    .eq("book_id", bookId);
  const map = new Map<string, { code: string; name: string; type: AccountType; subtype: AccountSubtype }>();
  for (const a of (data ?? []) as any[]) {
    map.set(a.id, {
      code: a.code,
      name: a.name,
      type: a.account_type as AccountType,
      subtype: a.subtype as AccountSubtype,
    });
  }
  return map;
}

/** Posted journal lines for a book, on or before `asOf` (and optionally from `from`). */
async function postedLines(bookId: string, asOf: string, from?: string): Promise<PostedLine[]> {
  let query = db()
    .from("journal_entries")
    .select("id, entry_date")
    .eq("book_id", bookId)
    .eq("status", "posted")
    .lte("entry_date", asOf);
  if (from) query = query.gte("entry_date", from);
  const { data: entries } = await query;
  const rows = (entries ?? []) as { id: string; entry_date: string }[];
  if (rows.length === 0) return [];
  const dateById = new Map(rows.map((r) => [r.id, r.entry_date]));
  const { data: lines } = await db()
    .from("journal_lines")
    .select("entry_id, account_id, debit_cents, credit_cents")
    .in(
      "entry_id",
      rows.map((r) => r.id),
    );
  return ((lines ?? []) as any[]).map((l) => ({
    accountId: l.account_id,
    debitCents: Number(l.debit_cents),
    creditCents: Number(l.credit_cents),
    entryId: l.entry_id,
    entryDate: dateById.get(l.entry_id) ?? asOf,
  }));
}

function toBalances(
  lines: PostedLine[],
  chart: Map<string, { code: string; name: string; type: AccountType; subtype: AccountSubtype }>,
): LedgerBalance[] {
  const acc = new Map<string, LedgerBalance>();
  for (const line of lines) {
    const meta = chart.get(line.accountId);
    if (!meta) continue;
    const current =
      acc.get(line.accountId) ??
      ({
        accountId: line.accountId,
        code: meta.code,
        name: meta.name,
        accountType: meta.type,
        subtype: meta.subtype,
        debitCents: 0,
        creditCents: 0,
      } satisfies LedgerBalance);
    current.debitCents += line.debitCents;
    current.creditCents += line.creditCents;
    acc.set(line.accountId, current);
  }
  return [...acc.values()].sort((a, b) => a.code.localeCompare(b.code));
}

// -------------------------------------------------------------- calculation

function daysBetween(fromIso: string, toIso: string) {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export type NavCalculation = Awaited<ReturnType<typeof calculateNAV>>;

/**
 * Calculate (and persist as a draft version) the NAV for a fund on a date.
 * Re-running before review refreshes the draft rather than creating clutter.
 */
export async function calculateNAV(
  userId: string,
  input: { offeringId: string; asOfDate: string; frequency?: NavFrequency; unitsOutstanding?: number | null },
) {
  const scope = await reviewerScope(userId);
  assertScopeAllows(scope, input.offeringId);
  if (!scope.isAdmin) fail("Forbidden: Harmonious prepares NAV.");

  const book = await ledgerBookForOffering(userId, input.offeringId);
  const policy = await navPolicyFor(input.offeringId);
  const frequency = input.frequency ?? policy.frequency;
  const period = periodBoundsFor(frequency, input.asOfDate);

  const chart = await chartFor(book.id);
  const cumulative = await postedLines(book.id, input.asOfDate);
  const inPeriod = cumulative.filter((l) => l.entryDate >= period.start);
  const balances = toBalances(cumulative, chart);
  const periodBalances = toBalances(inPeriod, chart);

  // ---- valuations effective as at the NAV date (never today's latest mark)
  const { data: assetRows } = await db()
    .from("portfolio_assets")
    .select("id, asset_name, status, cost_basis_cents")
    .eq("book_id", book.id);
  const assets = (assetRows ?? []) as {
    id: string;
    asset_name: string;
    status: string;
    cost_basis_cents: number;
  }[];
  const liveAssets = assets.filter((a) => a.status !== "fully_realized");

  const { data: valuationRows } = await db()
    .from("portfolio_valuations")
    .select("id, asset_id, effective_date, version, status, value_cents")
    .eq("book_id", book.id)
    .in("status", ["effective", "superseded"]);
  const versions: (ValuationRecord & { valuationId: string })[] = ((valuationRows ?? []) as any[]).map(
    (v) => ({
      id: v.id,
      valuationId: v.id,
      assetId: v.asset_id,
      effectiveDate: v.effective_date,
      version: Number(v.version),
      status: v.status,
      valueCents: Number(v.value_cents),
    }),
  );

  const used: {
    assetId: string;
    assetName: string;
    valuationId: string | null;
    version: number | null;
    effectiveDate: string | null;
    valueCents: number;
  }[] = [];
  const missing: string[] = [];
  const stale: { assetName: string; days: number }[] = [];
  const future: string[] = [];

  for (const asset of liveAssets) {
    const mine = versions.filter((v) => v.assetId === asset.id);
    if (mine.some((v) => v.effectiveDate > input.asOfDate && v.status === "effective")) {
      // Recorded for transparency; such a mark is excluded from the figures.
      future.push(asset.asset_name);
    }
    const match = valuationAsOf(mine, input.asOfDate);
    if (!match) {
      missing.push(asset.asset_name);
      used.push({
        assetId: asset.id,
        assetName: asset.asset_name,
        valuationId: null,
        version: null,
        effectiveDate: null,
        valueCents: 0,
      });
      continue;
    }
    const age = daysBetween(match.effectiveDate, input.asOfDate);
    if (age > policy.valuationStalenessDays) stale.push({ assetName: asset.asset_name, days: age });
    used.push({
      assetId: asset.id,
      assetName: asset.asset_name,
      valuationId: match.id,
      version: match.version,
      effectiveDate: match.effectiveDate,
      valueCents: match.valueCents,
    });
  }

  const investmentsFairValueCents = used.reduce((total, u) => total + u.valueCents, 0);
  const pkg = navPackage({
    balances,
    investmentsFairValueCents: liveAssets.length > 0 ? investmentsFairValueCents : null,
    unitAccounting: policy.unitAccounting,
    unitsOutstanding: input.unitsOutstanding ?? null,
  });
  const activity = activityFromBalances(periodBalances);

  // ---- prior published NAV
  const { data: priorRows } = await db()
    .from("nav_versions")
    .select("id, as_of_date, net_asset_value_cents, status, version")
    .eq("book_id", book.id)
    .lt("as_of_date", input.asOfDate)
    .in("status", ["published", "superseded"])
    .order("as_of_date", { ascending: false })
    .order("version", { ascending: false })
    .limit(1);
  const prior = ((priorRows ?? []) as any[])[0] ?? null;
  const priorNavCents = prior ? Number(prior.net_asset_value_cents) : 0;

  const bridge = navBridge(priorNavCents, activity, pkg.netAssetValueCents);
  const { changeCents, changePct } = navChange(priorNavCents, pkg.netAssetValueCents);

  // ---- pre-NAV checks
  const { data: unreconciled } = await db()
    .from("bank_reconciliations")
    .select("id, status, bank_transactions(amount_cents, posted_on)")
    .eq("offering_id", input.offeringId)
    .not("status", "in", "(posted,rejected)");
  const unreconciledCashCents = ((unreconciled ?? []) as any[]).reduce((total, r) => {
    const tx = r.bank_transactions ?? {};
    if (tx.posted_on && tx.posted_on > input.asOfDate) return total;
    return total + Math.abs(Number(tx.amount_cents ?? 0));
  }, 0);

  const { data: unposted } = await db()
    .from("journal_entries")
    .select("id, entry_date, status")
    .eq("book_id", book.id)
    .in("status", ["draft", "reviewed", "approved"])
    .lte("entry_date", input.asOfDate);
  const unpostedIds = ((unposted ?? []) as any[]).map((e) => e.id);
  let unpostedJournalCents = 0;
  if (unpostedIds.length > 0) {
    const { data: unpostedLines } = await db()
      .from("journal_lines")
      .select("debit_cents")
      .in("entry_id", unpostedIds);
    unpostedJournalCents = ((unpostedLines ?? []) as any[]).reduce(
      (total, l) => total + Number(l.debit_cents),
      0,
    );
  }

  const { count: openExceptionCount } = await db()
    .from("accounting_exceptions")
    .select("id", { count: "exact", head: true })
    .eq("offering_id", input.offeringId)
    .in("status", ["open", "investigating"]);

  const { count: valuationExceptionCount } = await db()
    .from("accounting_exceptions")
    .select("id", { count: "exact", head: true })
    .eq("offering_id", input.offeringId)
    .in("status", ["open", "investigating"])
    .in("kind", [
      "stale_valuation",
      "missing_valuation_source",
      "missing_valuation_methodology",
      "unsupported_valuation_change",
      "conflicting_valuation_sources",
      "impossible_valuation",
      "missing_valuation_evidence",
    ]);

  const { data: periodRow } = await db()
    .from("accounting_periods")
    .select("id, status, period_start, period_end")
    .eq("book_id", book.id)
    .lte("period_start", input.asOfDate)
    .gte("period_end", input.asOfDate)
    .maybeSingle();

  const ledgerDebitCents = balances.reduce((t, b) => t + b.debitCents, 0);
  const ledgerCreditCents = balances.reduce((t, b) => t + b.creditCents, 0);

  const checks = navChecks(
    {
      ledgerDebitCents,
      ledgerCreditCents,
      unreconciledCashCents,
      unpostedJournalCents,
      openExceptionCount: Number(openExceptionCount ?? 0),
      assetsMissingValuation: missing,
      staleValuations: stale,
      valuationExceptionCount: Number(valuationExceptionCount ?? 0),
      missingExpenseAccrual:
        activity.managementFeesCents === 0 && activity.fundExpensesCents === 0,
      openReceivablesPayablesCents: pkg.receivablesCents + pkg.payablesCents,
      unresolvedCapitalActivityCents: 0,
      periodStatus: periodRow?.status ?? null,
      futureValuations: future,
      bridgeDifferenceCents: bridge.differenceCents,
      valuationCarryingDifferenceCents:
        liveAssets.length > 0 ? investmentsFairValueCents - pkg.investmentsCarryingCents : 0,
    },
    policy,
  );

  const snapshot = {
    methodology_version: policy.methodologyVersion,
    source_cutoff_at: nowIso(),
    period,
    balances,
    period_balances: periodBalances,
    activity,
    package: pkg,
    valuations: used,
    policy,
    ledger_totals: { debitCents: ledgerDebitCents, creditCents: ledgerCreditCents },
  };

  // ---- persist as the working draft for this book and date
  const { data: existingRows } = await db()
    .from("nav_versions")
    .select("id, status, version, prepared_by")
    .eq("book_id", book.id)
    .eq("as_of_date", input.asOfDate)
    .order("version", { ascending: false });
  const existing = ((existingRows ?? []) as any[])[0] ?? null;
  const reusable = existing && ["draft", "calculating"].includes(existing.status) ? existing : null;

  const row = {
    book_id: book.id,
    offering_id: input.offeringId,
    period_id: periodRow?.id ?? null,
    as_of_date: input.asOfDate,
    period_start: period.start,
    period_label: period.label,
    frequency,
    status: "draft",
    methodology: "ledger_derived",
    methodology_version: policy.methodologyVersion,
    source_cutoff_at: snapshot.source_cutoff_at,
    cash_cents: pkg.cashCents,
    investments_at_cost_cents: pkg.investmentsAtCostCents,
    investments_fair_value_cents: pkg.investmentsFairValueCents,
    receivables_cents: pkg.receivablesCents,
    accrued_income_cents: pkg.accruedIncomeCents,
    other_assets_cents: pkg.otherAssetsCents,
    gross_asset_value_cents: pkg.grossAssetsCents,
    payables_cents: pkg.payablesCents,
    accrued_expenses_cents: pkg.accruedExpensesCents,
    management_fee_cents: pkg.managementFeeCents,
    tax_liabilities_cents: pkg.taxLiabilitiesCents,
    other_liabilities_cents: pkg.otherLiabilitiesCents,
    liabilities_cents: pkg.totalLiabilitiesCents,
    total_liabilities_cents: pkg.totalLiabilitiesCents,
    net_asset_value_cents: pkg.netAssetValueCents,
    contributions_cents: activity.contributionsCents,
    distributions_cents: activity.distributionsCents,
    realized_gain_cents: activity.realizedGainCents - activity.realizedLossCents,
    unrealized_gain_cents: activity.unrealizedGainCents - activity.unrealizedLossCents,
    investment_income_cents: activity.investmentIncomeCents,
    fund_expenses_cents: activity.fundExpensesCents,
    unit_accounting: policy.unitAccounting,
    units_outstanding: pkg.unitsOutstanding,
    nav_per_unit_cents: pkg.navPerUnitCents,
    prior_nav_version_id: prior?.id ?? null,
    prior_nav_cents: priorNavCents,
    change_cents: changeCents,
    change_pct: changePct,
    bridge,
    inputs_snapshot: snapshot,
    valuation_versions: used,
    checks,
    capital_handoff: capitalHandoff(period, activity, pkg),
    prepared_by: userId,
    prepared_at: nowIso(),
    updated_at: nowIso(),
  };

  let nav: any;
  if (reusable) {
    const { data, error } = await db()
      .from("nav_versions")
      .update(row)
      .eq("id", reusable.id)
      .select("*")
      .single();
    if (error) fail(error.message);
    nav = data;
    await db().from("nav_checks").delete().eq("nav_version_id", nav.id);
  } else {
    const { data, error } = await db()
      .from("nav_versions")
      .insert({ ...row, version: existing ? Number(existing.version) + 1 : 1 })
      .select("*")
      .single();
    if (error) fail(error.message);
    nav = data;
  }

  await db()
    .from("nav_checks")
    .insert(
      checks.map((c) => ({
        nav_version_id: nav.id,
        offering_id: input.offeringId,
        code: c.code,
        severity: c.severity,
        detail: c.detail,
        context: c.context ?? {},
        overridable: c.overridable,
      })),
    );

  await recordEvent({
    navVersionId: nav.id,
    offeringId: input.offeringId,
    actorUserId: userId,
    actorRole: "harmonious",
    action: "calculated",
    toStatus: "draft",
    payload: { asOfDate: input.asOfDate, netAssetValueCents: pkg.netAssetValueCents },
  });

  return { nav, checks, bridge, package: pkg, activity, valuations: used, period, policy };
}

// -------------------------------------------------------------------- reads

async function authorizeNav(userId: string, navVersionId: string) {
  const scope = await reviewerScope(userId);
  const { data: nav } = await db()
    .from("nav_versions")
    .select("*")
    .eq("id", navVersionId)
    .maybeSingle();
  if (!nav) fail("NAV version not found.");
  assertScopeAllows(scope, nav.offering_id);
  return { scope, nav };
}

export async function getNAVAsOf(userId: string, offeringId: string, asOfDate: string) {
  const scope = await reviewerScope(userId);
  assertScopeAllows(scope, offeringId);
  const { data } = await db()
    .from("nav_versions")
    .select("*")
    .eq("offering_id", offeringId)
    .lte("as_of_date", asOfDate)
    .eq("status", "published")
    .order("as_of_date", { ascending: false })
    .order("version", { ascending: false })
    .limit(1);
  return ((data ?? []) as any[])[0] ?? null;
}

export async function getNAVBridge(userId: string, navVersionId: string) {
  const { nav } = await authorizeNav(userId, navVersionId);
  return nav.bridge ?? null;
}

export async function getNAVInputs(userId: string, navVersionId: string) {
  const { nav } = await authorizeNav(userId, navVersionId);
  return {
    sourceCutoffAt: nav.source_cutoff_at,
    methodologyVersion: nav.methodology_version,
    snapshot: nav.inputs_snapshot ?? {},
    valuations: nav.valuation_versions ?? [],
  };
}

export async function getNAVExceptions(userId: string, navVersionId: string) {
  const { nav } = await authorizeNav(userId, navVersionId);
  const { data } = await db()
    .from("nav_checks")
    .select("*")
    .eq("nav_version_id", nav.id)
    .order("severity", { ascending: true });
  return (data ?? []) as any[];
}

export async function navHistory(userId: string, offeringId: string) {
  const scope = await reviewerScope(userId);
  assertScopeAllows(scope, offeringId);
  const { data } = await db()
    .from("nav_versions")
    .select("*")
    .eq("offering_id", offeringId)
    .order("as_of_date", { ascending: false })
    .order("version", { ascending: false })
    .limit(50);
  return (data ?? []) as any[];
}

/** Everything the NAV workspace shows, for one fund or every fund in scope. */
export async function navQueue(userId: string, offeringId?: string) {
  const scope = await reviewerScope(userId);
  if (offeringId) assertScopeAllows(scope, offeringId);

  let query = db()
    .from("nav_versions")
    .select("*")
    .order("as_of_date", { ascending: false })
    .order("version", { ascending: false })
    .limit(100);
  if (offeringId) query = query.eq("offering_id", offeringId);
  else if (!scope.isAdmin) query = query.in("offering_id", scope.offeringIds);
  const { data } = await query;
  const navs = (data ?? []) as any[];

  const { data: fundRows } = await db()
    .from("offerings")
    .select("id, name")
    .order("name", { ascending: true });
  const funds = ((fundRows ?? []) as any[]).filter(
    (f) => scope.isAdmin || scope.offeringIds.includes(f.id),
  );
  const fundName = new Map(funds.map((f) => [f.id, f.name]));

  const ids = navs.map((n) => n.id);
  const { data: checkRows } = ids.length
    ? await db().from("nav_checks").select("*").in("nav_version_id", ids)
    : { data: [] };

  return {
    isStaff: scope.isAdmin,
    funds: funds.map((f) => ({ id: f.id, name: f.name })),
    navs: navs.map((n) => ({
      ...n,
      fund_name: fundName.get(n.offering_id) ?? "Fund",
      check_rows: ((checkRows ?? []) as any[]).filter((c) => c.nav_version_id === n.id),
    })),
  };
}

// ---------------------------------------------------------------- workflow

function checksOf(nav: any): NavCheck[] {
  return Array.isArray(nav.checks) ? (nav.checks as NavCheck[]) : [];
}

function overridesOf(nav: any): NavOverride[] {
  return Array.isArray(nav.overrides) ? (nav.overrides as NavOverride[]) : [];
}

async function moveNav(
  userId: string,
  navVersionId: string,
  to: NavStatus,
  patch: Record<string, unknown>,
  reason?: string,
) {
  const { nav } = await authorizeNav(userId, navVersionId);
  const from = nav.status as NavStatus;
  if (!canTransitionNav(from, to)) fail(`A ${from} NAV cannot move to ${to}.`);
  const { data, error } = await db()
    .from("nav_versions")
    .update({ status: to, updated_at: nowIso(), ...patch })
    .eq("id", navVersionId)
    .eq("status", from)
    .select("*")
    .single();
  if (error) fail(error.message);
  await recordEvent({
    navVersionId,
    offeringId: nav.offering_id,
    actorUserId: userId,
    actorRole: "harmonious",
    action: `nav_${to}`,
    fromStatus: from,
    toStatus: to,
    reason: reason ?? null,
  });
  return data;
}

export async function submitNavForReview(userId: string, navVersionId: string) {
  await assertHarmonious(userId);
  const { nav } = await authorizeNav(userId, navVersionId);
  if (!canSubmitForReview(checksOf(nav))) {
    fail("NAV cannot go to review while a blocking pre-NAV check is failing.");
  }
  return moveNav(userId, navVersionId, "review", { reviewed_by: null, reviewed_at: null });
}

export async function reviewNav(userId: string, navVersionId: string) {
  await assertHarmonious(userId);
  const { nav } = await authorizeNav(userId, navVersionId);
  const problem = segregationError({ preparedBy: nav.prepared_by }, userId, "review");
  if (problem) fail(problem);
  const { data, error } = await db()
    .from("nav_versions")
    .update({ reviewed_by: userId, reviewed_at: nowIso(), updated_at: nowIso() })
    .eq("id", navVersionId)
    .eq("status", "review")
    .select("*")
    .single();
  if (error) fail(error.message);
  await recordEvent({
    navVersionId,
    offeringId: nav.offering_id,
    actorUserId: userId,
    actorRole: "harmonious",
    action: "nav_reviewed",
  });
  return data;
}

export async function approveNav(userId: string, navVersionId: string) {
  await assertHarmonious(userId);
  const { nav } = await authorizeNav(userId, navVersionId);
  const problem = segregationError(
    { preparedBy: nav.prepared_by, reviewedBy: nav.reviewed_by },
    userId,
    "approve",
  );
  if (problem) fail(problem);
  const policy = await navPolicyFor(nav.offering_id);
  if (policy.managerApprovalRequired && !nav.manager_approved_by) {
    fail("This fund's workflow requires the fund manager to approve NAV first.");
  }
  return moveNav(userId, navVersionId, "approved", {
    approved_by: userId,
    approved_at: nowIso(),
  });
}

export async function returnNavToDraft(userId: string, navVersionId: string, reason: string) {
  await assertHarmonious(userId);
  if (reason.trim().length < 4) fail("Say why the NAV is going back.");
  return moveNav(userId, navVersionId, "draft", { revision_reason: reason }, reason);
}

export async function overrideNavCheck(
  userId: string,
  navVersionId: string,
  code: NavCheckCode,
  reason: string,
) {
  await assertHarmonious(userId);
  if (!canOverride(code)) fail("That is an integrity failure and can never be overridden.");
  if (reason.trim().length < 8) fail("An override needs a documented reason.");
  const { nav } = await authorizeNav(userId, navVersionId);
  if (nav.status === "published" || nav.status === "superseded") {
    fail("A published NAV cannot be changed.");
  }
  const override: NavOverride = { code, reason: reason.trim(), by: userId, at: nowIso() };
  const overrides = [...overridesOf(nav).filter((o) => o.code !== code), override];
  await db()
    .from("nav_versions")
    .update({ overrides, updated_at: nowIso() })
    .eq("id", navVersionId);
  await db()
    .from("nav_checks")
    .update({ overridden_by: userId, overridden_at: override.at, override_reason: override.reason })
    .eq("nav_version_id", navVersionId)
    .eq("code", code);
  await recordEvent({
    navVersionId,
    offeringId: nav.offering_id,
    actorUserId: userId,
    actorRole: "harmonious",
    action: "nav_check_overridden",
    reason: override.reason,
    payload: { code },
  });
  return override;
}

/** Publishing freezes the snapshot and registers the NAV in the report registry. */
export async function publishNav(userId: string, navVersionId: string) {
  await assertHarmonious(userId);
  const { nav } = await authorizeNav(userId, navVersionId);
  const problem = segregationError(
    { preparedBy: nav.prepared_by, reviewedBy: nav.reviewed_by },
    userId,
    "publish",
  );
  if (problem) fail(problem);
  const blockers = publicationBlockers(checksOf(nav), overridesOf(nav));
  if (blockers.length > 0) {
    fail(`NAV cannot be published: ${blockers.map((b) => b.detail).join(" ")}`);
  }
  if (!canPublish(checksOf(nav), overridesOf(nav))) fail("NAV cannot be published.");

  const published = await moveNav(userId, navVersionId, "published", {
    published_by: userId,
    published_at: nowIso(),
  });

  // The version this one revises is retired, never altered.
  if (nav.supersedes_id) {
    await db()
      .from("nav_versions")
      .update({ status: "superseded", superseded_by_id: navVersionId })
      .eq("id", nav.supersedes_id)
      .eq("status", "published");
  }

  await registerReport(userId, {
    bookId: nav.book_id,
    reportType: "valuation_report",
    periodId: nav.period_id,
    periodStart: nav.period_start,
    periodEnd: nav.as_of_date,
    navVersionId,
    methodologyVersion: nav.methodology_version,
    accountingSnapshot: nav.inputs_snapshot ?? {},
    payload: {
      net_asset_value_cents: nav.net_asset_value_cents,
      nav_version: nav.version,
      bridge: nav.bridge,
      checks: nav.checks,
      overrides: nav.overrides,
    },
  });

  return published;
}

/** An error found after publication becomes version n+1, linked to the original. */
export async function reviseNav(userId: string, navVersionId: string, reason: string) {
  await assertHarmonious(userId);
  if (reason.trim().length < 8) fail("A revision needs a stated reason.");
  const { nav } = await authorizeNav(userId, navVersionId);
  if (nav.status !== "published") fail("Only a published NAV is revised.");

  const recalculated = await calculateNAV(userId, {
    offeringId: nav.offering_id,
    asOfDate: nav.as_of_date,
    frequency: nav.frequency,
    unitsOutstanding: nav.units_outstanding,
  });

  const impact = revisionImpact(
    Number(nav.net_asset_value_cents),
    Number(recalculated.nav.net_asset_value_cents),
  );
  const { data, error } = await db()
    .from("nav_versions")
    .update({
      supersedes_id: nav.id,
      revision_reason: reason.trim(),
      revision_impact_cents: impact.impactCents,
      revision_impact_pct: impact.impactPct,
      updated_at: nowIso(),
    })
    .eq("id", recalculated.nav.id)
    .select("*")
    .single();
  if (error) fail(error.message);

  await recordEvent({
    navVersionId: data.id,
    offeringId: nav.offering_id,
    actorUserId: userId,
    actorRole: "harmonious",
    action: "nav_revision_opened",
    reason: reason.trim(),
    payload: { supersedes: nav.id, ...impact },
  });
  return data;
}

// ------------------------------------------------------------ fund manager

export async function managerRespondToNav(
  userId: string,
  navVersionId: string,
  action: "acknowledge" | "challenge" | "approve",
  note?: string,
) {
  const { scope, nav } = await authorizeNav(userId, navVersionId);
  const policy = await navPolicyFor(nav.offering_id);
  if (!scope.isAdmin && !managerMayNav(action, policy.managerWorkflow)) {
    fail("Your fund's NAV workflow does not allow that.");
  }
  if (nav.status === "published" || nav.status === "superseded") {
    fail("A published NAV cannot be changed.");
  }

  const now = nowIso();
  if (action === "challenge") {
    if (!note || note.trim().length < 4) fail("Say what looks wrong.");
    // A challenge returns NAV to review; it never changes a figure.
    const patch: Record<string, unknown> = {
      manager_challenge_note: note.trim(),
      manager_acknowledged_by: null,
      manager_acknowledged_at: null,
      manager_approved_by: null,
      manager_approved_at: null,
      updated_at: now,
    };
    if (nav.status === "approved") {
      await db().from("nav_versions").update({ ...patch, status: "review" }).eq("id", nav.id);
    } else {
      await db().from("nav_versions").update(patch).eq("id", nav.id);
    }
    await recordEvent({
      navVersionId: nav.id,
      offeringId: nav.offering_id,
      actorUserId: userId,
      actorRole: scope.isAdmin ? "harmonious" : "fund_manager",
      action: "nav_challenged",
      reason: note.trim(),
    });
    return { challenged: true };
  }

  const patch =
    action === "approve"
      ? { manager_approved_by: userId, manager_approved_at: now, updated_at: now }
      : { manager_acknowledged_by: userId, manager_acknowledged_at: now, updated_at: now };
  await db().from("nav_versions").update(patch).eq("id", nav.id);
  await recordEvent({
    navVersionId: nav.id,
    offeringId: nav.offering_id,
    actorUserId: userId,
    actorRole: scope.isAdmin ? "harmonious" : "fund_manager",
    action: `nav_manager_${action}`,
    ...(note ? { reason: note } : {}),
  });
  return { acknowledged: action === "acknowledge", approved: action === "approve" };
}

/** Controlled output for Step 4's allocation engine. Nothing is allocated here. */
export async function navCapitalHandoff(userId: string, navVersionId: string) {
  const { nav } = await authorizeNav(userId, navVersionId);
  if (nav.status !== "published") fail("Only a published NAV hands off to capital accounts.");
  return nav.capital_handoff ?? {};
}
