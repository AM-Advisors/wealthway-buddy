/**
 * Server-only financial reporting engine.
 *
 * Statements are assembled from records that are already authoritative:
 * posted journal lines, effective valuations, the approved NAV and finalized
 * allocation runs. The engine never recalculates a fund result independently,
 * and the browser never decides what it may see.
 *
 * Controls preserved here:
 *  - nothing trusts a fund, book, report or period id sent by the browser;
 *  - preparer ≠ reviewer ≠ approver, and Harmonious alone publishes;
 *  - a published report is never edited — corrections are new versions;
 *  - every published figure keeps the snapshot it was produced from.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reviewerScope, assertScopeAllows, type ReviewerScope } from "@/lib/reviewer-authz.server";
import { ledgerBookForOffering } from "@/lib/accounting.server";
import { valuationAsOf, type ValuationRecord } from "@/lib/valuation-model";
import type { AccountSubtype, AccountType } from "@/lib/accounting-model";
import {
  balanceSheet,
  blockingExceptions,
  canTransitionFinancialReport,
  canTransitionWorkpaper,
  cashFlowStatement,
  changesInCapital,
  CLOSE_CHECKLIST,
  closeBlockers,
  comparableMapping,
  DEFAULT_MAPPING_LINES,
  incomeStatement,
  isReportingBasis,
  missingStatementProvenance,
  packageManifest,
  PACKAGE_TEMPLATES,
  priorPeriodBounds,
  publicationBlockers,
  reportingExceptions,
  scheduleOfInvestments,
  segregationError,
  STATEMENT_LABELS,
  trialBalance,
  unmappedAccounts,
  workpaperSignoffError,
  yearStart,
  type AccountBalance,
  type AccountRef,
  type CashMovement,
  type ChecklistItem,
  type FinancialReportStatus,
  type MappingLine,
  type ReportingBasis,
  type ScheduleHolding,
  type StatementKind,
  type StatementLine,
  type StatementMapping,
  type WorkpaperKind,
  type WorkpaperStatus,
} from "@/lib/financial-reporting-model";

const db = () => supabaseAdmin as any;
const nowIso = () => new Date().toISOString();

function fail(message: string): never {
  throw new Error(message);
}

/** Registry report type each statement is filed under. */
const REPORT_TYPE_FOR: Record<StatementKind, string> = {
  balance_sheet: "balance_sheet",
  income_statement: "income_statement",
  changes_in_capital: "changes_in_capital",
  cash_flow: "cash_flow",
  schedule_of_investments: "schedule_of_investments",
  trial_balance: "trial_balance",
  general_ledger: "general_ledger",
  journal_register: "audit_support",
  cash_activity: "cash_activity",
  realized_gains: "gain_report",
  unrealized_gains: "gain_report",
  expense_detail: "expense_report",
  management_fee_detail: "management_fee",
  investor_capital_reconciliation: "capital_account_statement",
};

// ------------------------------------------------------------- authority

async function assertHarmonious(userId: string): Promise<ReviewerScope> {
  const scope = await reviewerScope(userId);
  if (!scope.isAdmin) fail("Forbidden: Harmonious financial reporting authority required.");
  return scope;
}

/** Resolve the fund server-side and confirm the caller may see its accounting. */
async function authorizeFund(userId: string, offeringId: string) {
  const scope = await reviewerScope(userId);
  assertScopeAllows(scope, offeringId);
  return scope;
}

async function authorizeReport(userId: string, reportId: string) {
  const { data: report } = await db()
    .from("financial_reports")
    .select("*")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) fail("Report not found.");
  if (!report.offering_id) fail("This report is not attached to a fund.");
  const scope = await authorizeFund(userId, report.offering_id);
  return { report, scope };
}

// ------------------------------------------------------------ ledger reads

type ChartMap = Map<string, AccountRef>;

async function chartFor(bookId: string): Promise<ChartMap> {
  const { data } = await db()
    .from("chart_of_accounts")
    .select("id, code, name, account_type, subtype")
    .eq("book_id", bookId);
  const map: ChartMap = new Map();
  for (const a of (data ?? []) as any[]) {
    map.set(a.id, {
      accountId: a.id,
      code: a.code,
      name: a.name,
      accountType: a.account_type as AccountType,
      subtype: a.subtype as AccountSubtype,
    });
  }
  return map;
}

type PostedLine = {
  entryId: string;
  entryDate: string;
  accountId: string;
  debitCents: number;
  creditCents: number;
  memo: string | null;
  lineId: string;
};

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
    .select("id, entry_id, account_id, debit_cents, credit_cents, memo")
    .in(
      "entry_id",
      rows.map((r) => r.id),
    );
  return ((lines ?? []) as any[]).map((l) => ({
    lineId: l.id,
    entryId: l.entry_id,
    entryDate: dateById.get(l.entry_id) ?? asOf,
    accountId: l.account_id,
    debitCents: Number(l.debit_cents ?? 0),
    creditCents: Number(l.credit_cents ?? 0),
    memo: l.memo ?? null,
  }));
}

/** Opening balances before the period, plus activity inside it, per account. */
function toAccountBalances(
  chart: ChartMap,
  cumulative: PostedLine[],
  periodStart: string,
): AccountBalance[] {
  const acc = new Map<string, AccountBalance>();
  for (const line of cumulative) {
    const meta = chart.get(line.accountId);
    if (!meta) continue;
    const current =
      acc.get(line.accountId) ??
      ({
        ...meta,
        openingDebitCents: 0,
        openingCreditCents: 0,
        debitCents: 0,
        creditCents: 0,
      } satisfies AccountBalance);
    if (line.entryDate < periodStart) {
      current.openingDebitCents = (current.openingDebitCents ?? 0) + line.debitCents;
      current.openingCreditCents = (current.openingCreditCents ?? 0) + line.creditCents;
    } else {
      current.debitCents += line.debitCents;
      current.creditCents += line.creditCents;
    }
    acc.set(line.accountId, current);
  }
  return [...acc.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function periodOnly(balances: AccountBalance[]): AccountBalance[] {
  return balances.map((b) => ({ ...b, openingDebitCents: 0, openingCreditCents: 0 }));
}

// --------------------------------------------------------- statement maps

/** The active mapping for a book, created from the default the first time. */
export async function activeMapping(
  bookId: string,
  offeringId: string,
  basis: ReportingBasis,
): Promise<{ id: string; mapping: StatementMapping }> {
  const { data: existing } = await db()
    .from("statement_mapping_versions")
    .select("id, version, basis, lines")
    .eq("book_id", bookId)
    .eq("basis", basis)
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1);
  const found = (existing ?? [])[0];
  if (found) {
    return {
      id: found.id,
      mapping: { version: Number(found.version), basis, lines: found.lines as MappingLine[] },
    };
  }
  const { data, error } = await db()
    .from("statement_mapping_versions")
    .insert({
      book_id: bookId,
      offering_id: offeringId,
      basis,
      version: 1,
      status: "active",
      lines: DEFAULT_MAPPING_LINES,
      activated_at: nowIso(),
    })
    .select("id, version")
    .single();
  if (error) fail(error.message);
  return { id: data.id, mapping: { version: 1, basis, lines: DEFAULT_MAPPING_LINES } };
}

/** A new mapping version never rewrites the one published statements used. */
export async function saveStatementMapping(
  userId: string,
  input: { offeringId: string; basis: ReportingBasis; lines: MappingLine[]; label?: string },
) {
  await assertHarmonious(userId);
  await authorizeFund(userId, input.offeringId);
  if (!isReportingBasis(input.basis)) fail("Unknown reporting basis.");
  const book = await ledgerBookForOffering(userId, input.offeringId);

  const { data: prior } = await db()
    .from("statement_mapping_versions")
    .select("id, version")
    .eq("book_id", book.id)
    .eq("basis", input.basis)
    .order("version", { ascending: false })
    .limit(1);
  const previous = (prior ?? [])[0] ?? null;

  const { data, error } = await db()
    .from("statement_mapping_versions")
    .insert({
      book_id: book.id,
      offering_id: input.offeringId,
      basis: input.basis,
      label: input.label ?? "Statement mapping",
      version: previous ? Number(previous.version) + 1 : 1,
      status: "active",
      lines: input.lines,
      created_by: userId,
      activated_by: userId,
      activated_at: nowIso(),
    })
    .select("*")
    .single();
  if (error) fail(error.message);

  if (previous) {
    await db()
      .from("statement_mapping_versions")
      .update({ status: "retired", retired_at: nowIso() })
      .eq("id", previous.id)
      .eq("status", "active");
  }
  return data;
}

export async function listStatementMappings(userId: string, offeringId: string) {
  await authorizeFund(userId, offeringId);
  const { data } = await db()
    .from("statement_mapping_versions")
    .select("id, version, basis, status, label, activated_at, created_at")
    .eq("offering_id", offeringId)
    .order("version", { ascending: false });
  return data ?? [];
}

// ------------------------------------------------------- canonical reads

export async function trialBalanceAsOf(
  userId: string,
  offeringId: string,
  asOfDate: string,
  periodStart?: string,
) {
  await authorizeFund(userId, offeringId);
  const book = await ledgerBookForOffering(userId, offeringId);
  const chart = await chartFor(book.id);
  const lines = await postedLines(book.id, asOfDate);
  const balances = toAccountBalances(chart, lines, periodStart ?? yearStart(asOfDate));
  return trialBalance(asOfDate, balances);
}

export async function generalLedgerForPeriod(
  userId: string,
  offeringId: string,
  input: { periodStart: string; periodEnd: string; accountCode?: string },
) {
  await authorizeFund(userId, offeringId);
  const book = await ledgerBookForOffering(userId, offeringId);
  const chart = await chartFor(book.id);
  const lines = await postedLines(book.id, input.periodEnd, input.periodStart);
  const rows = lines
    .map((l) => {
      const meta = chart.get(l.accountId);
      return meta
        ? {
            entryId: l.entryId,
            lineId: l.lineId,
            entryDate: l.entryDate,
            code: meta.code,
            name: meta.name,
            debitCents: l.debitCents,
            creditCents: l.creditCents,
            memo: l.memo,
          }
        : null;
    })
    .filter(Boolean) as any[];
  const filtered = input.accountCode ? rows.filter((r) => r.code === input.accountCode) : rows;
  return filtered.sort((a, b) =>
    a.entryDate === b.entryDate ? a.code.localeCompare(b.code) : a.entryDate.localeCompare(b.entryDate),
  );
}

export async function journalRegister(
  userId: string,
  offeringId: string,
  input: { periodStart: string; periodEnd: string },
) {
  await authorizeFund(userId, offeringId);
  const book = await ledgerBookForOffering(userId, offeringId);
  const { data } = await db()
    .from("journal_entries")
    .select(
      "id, entry_no, entry_date, memo, source, source_table, source_id, status, prepared_by, approved_by, posted_by, posted_at, reverses_entry_id",
    )
    .eq("book_id", book.id)
    .gte("entry_date", input.periodStart)
    .lte("entry_date", input.periodEnd)
    .order("entry_date", { ascending: true });
  return data ?? [];
}

export async function scheduleOfInvestmentsAsOf(
  userId: string,
  offeringId: string,
  asOfDate: string,
  netAssetsCents?: number | null,
) {
  await authorizeFund(userId, offeringId);
  const book = await ledgerBookForOffering(userId, offeringId);
  const holdings = await holdingsAsOf(book.id, asOfDate);
  return scheduleOfInvestments(asOfDate, holdings, netAssetsCents ?? null);
}

async function holdingsAsOf(bookId: string, asOfDate: string): Promise<ScheduleHolding[]> {
  const { data: assetRows } = await db()
    .from("portfolio_assets")
    .select(
      "id, issuer_name, asset_name, asset_class, instrument, acquisition_date, quantity, ownership_pct, cost_basis_cents, status, note",
    )
    .eq("book_id", bookId);
  const assets = ((assetRows ?? []) as any[]).filter((a) => a.status !== "fully_realized");
  if (assets.length === 0) return [];

  const { data: valuationRows } = await db()
    .from("portfolio_valuations")
    .select("id, asset_id, effective_date, version, status, value_cents, methodology")
    .eq("book_id", bookId)
    .in("status", ["effective", "superseded"]);
  const versions = ((valuationRows ?? []) as any[]).map((v) => ({
    id: v.id,
    assetId: v.asset_id,
    effectiveDate: v.effective_date,
    version: Number(v.version),
    status: v.status,
    valueCents: Number(v.value_cents ?? 0),
    methodology: v.methodology as string | null,
  }));

  return assets.map((asset) => {
    const mine = versions.filter((v) => v.assetId === asset.id);
    const match = valuationAsOf(mine as unknown as ValuationRecord[], asOfDate) as
      | (ValuationRecord & { methodology?: string | null })
      | null;
    const picked = match ? mine.find((v) => v.id === match.id) ?? null : null;
    return {
      assetId: asset.id,
      issuer: asset.issuer_name ?? asset.asset_name,
      instrument: asset.instrument ?? null,
      assetClass: asset.asset_class,
      industry: null,
      geography: null,
      acquisitionDate: asset.acquisition_date ?? null,
      quantity: asset.quantity === null ? null : Number(asset.quantity),
      ownershipPct: asset.ownership_pct === null ? null : Number(asset.ownership_pct),
      costBasisCents: Number(asset.cost_basis_cents ?? 0),
      fairValueCents: picked ? picked.valueCents : 0,
      valuationId: picked?.id ?? null,
      valuationVersion: picked?.version ?? null,
      valuationDate: picked?.effectiveDate ?? null,
      methodology: picked?.methodology ?? null,
    } satisfies ScheduleHolding;
  });
}

// ------------------------------------------------- supporting period data

async function periodFor(bookId: string, periodEnd: string) {
  const { data } = await db()
    .from("accounting_periods")
    .select("id, label, period_start, period_end, status")
    .eq("book_id", bookId)
    .eq("period_end", periodEnd)
    .maybeSingle();
  return data ?? null;
}

async function approvedNav(offeringId: string, asOfDate: string) {
  const { data } = await db()
    .from("nav_versions")
    .select("id, version, status, net_asset_value_cents, as_of_date, capital_handoff")
    .eq("offering_id", offeringId)
    .eq("as_of_date", asOfDate)
    .in("status", ["approved", "published"])
    .order("version", { ascending: false })
    .limit(1);
  return (data ?? [])[0] ?? null;
}

async function finalizedAllocations(offeringId: string, periodEnd: string) {
  const { data } = await db()
    .from("allocation_runs")
    .select("id, version, status, period_start, period_end, fund_totals")
    .eq("offering_id", offeringId)
    .eq("period_end", periodEnd)
    .eq("status", "finalized")
    .order("version", { ascending: false })
    .limit(1);
  const run = (data ?? [])[0] ?? null;
  if (!run) return { run: null, investorCapitalTotalCents: null as number | null, accounts: [] as any[] };
  const { data: accounts } = await db()
    .from("capital_accounts")
    .select(
      "id, investor_user_id, investment_profile_id, position_id, beginning_capital_cents, contributions_cents, distributions_cents, allocated_income_cents, allocated_loss_cents, other_adjustments_cents, ending_capital_cents",
    )
    .eq("allocation_run_id", run.id);
  const rows = (accounts ?? []) as any[];
  return {
    run,
    investorCapitalTotalCents: rows.reduce((t, a) => t + Number(a.ending_capital_cents ?? 0), 0),
    accounts: rows,
  };
}

async function cashMovements(
  bookId: string,
  chart: ChartMap,
  periodStart: string,
  periodEnd: string,
): Promise<CashMovement[]> {
  const lines = await postedLines(bookId, periodEnd, periodStart);
  const byEntry = new Map<string, PostedLine[]>();
  for (const line of lines) {
    byEntry.set(line.entryId, [...(byEntry.get(line.entryId) ?? []), line]);
  }
  const out: CashMovement[] = [];
  for (const [entryId, entryLines] of byEntry) {
    const cashLines = entryLines.filter((l) => chart.get(l.accountId)?.subtype === "cash");
    if (cashLines.length === 0) continue;
    const counter = entryLines.find((l) => chart.get(l.accountId)?.subtype !== "cash");
    const amount = cashLines.reduce((t, l) => t + l.debitCents - l.creditCents, 0);
    out.push({
      entryId,
      entryDate: cashLines[0]!.entryDate,
      amountCents: amount,
      counterSubtype: (chart.get(counter?.accountId ?? "")?.subtype ?? "other") as AccountSubtype,
      memo: counter?.memo ?? cashLines[0]!.memo ?? null,
    });
  }
  return out.sort((a, b) => a.entryDate.localeCompare(b.entryDate));
}

// ------------------------------------------------------ statement assembly

export type StatementSet = Awaited<ReturnType<typeof financialStatementsForPeriod>>;

/**
 * Build (without persisting) the full statement set for a fund and period.
 * This is the single place statements are computed; the UI only renders it.
 */
export async function financialStatementsForPeriod(
  userId: string,
  offeringId: string,
  input: { periodStart: string; periodEnd: string; basis?: ReportingBasis },
) {
  await authorizeFund(userId, offeringId);
  const basis: ReportingBasis = input.basis ?? "accrual";
  if (!isReportingBasis(basis)) fail("Unknown reporting basis.");

  const book = await ledgerBookForOffering(userId, offeringId);
  const { id: mappingVersionId, mapping } = await activeMapping(book.id, offeringId, basis);

  const chart = await chartFor(book.id);
  const cumulative = await postedLines(book.id, input.periodEnd);
  const balances = toAccountBalances(chart, cumulative, input.periodStart);
  const tb = trialBalance(input.periodEnd, balances);

  const ops = incomeStatement(input.periodStart, input.periodEnd, periodOnly(balances), mapping);
  const bs = balanceSheet(input.periodEnd, balances, mapping, ops.netIncreaseCents);

  const priorBounds = priorPeriodBounds(input.periodStart, input.periodEnd);
  const priorCumulative = cumulative.filter((l) => l.entryDate <= priorBounds.end);
  const priorBalances = toAccountBalances(chart, priorCumulative, priorBounds.start);
  const priorOps = incomeStatement(
    priorBounds.start,
    priorBounds.end,
    periodOnly(priorBalances),
    mapping,
  );
  const priorBs = balanceSheet(priorBounds.end, priorBalances, mapping, priorOps.netIncreaseCents);

  const ytdBalances = toAccountBalances(chart, cumulative, yearStart(input.periodEnd));
  const ytdOps = incomeStatement(
    yearStart(input.periodEnd),
    input.periodEnd,
    periodOnly(ytdBalances),
    mapping,
  );

  const capitalLine = (key: string) =>
    ops.lines.find((l) => l.key === key)?.amountCents ??
    bs.lines.find((l) => l.key === key)?.amountCents ??
    0;
  const periodContributions = periodOnly(balances)
    .filter((b) => b.subtype === "contribution")
    .reduce((t, b) => t + b.creditCents - b.debitCents, 0);
  const periodDistributions = periodOnly(balances)
    .filter((b) => b.subtype === "distribution")
    .reduce((t, b) => t + b.debitCents - b.creditCents, 0);

  const capital = changesInCapital({
    beginningCents: priorBs.netAssetsCents,
    contributionsCents: periodContributions,
    distributionsCents: periodDistributions,
    netOperationsCents: ops.netIncreaseCents,
    otherActivityCents:
      bs.netAssetsCents -
      (priorBs.netAssetsCents + periodContributions - periodDistributions + ops.netIncreaseCents),
  });

  const holdings = await holdingsAsOf(book.id, input.periodEnd);
  const schedule = scheduleOfInvestments(input.periodEnd, holdings, bs.netAssetsCents);

  const movements = await cashMovements(book.id, chart, input.periodStart, input.periodEnd);
  const cashBalance = (rows: AccountBalance[], cumulativeMode: boolean) =>
    rows
      .filter((b) => b.subtype === "cash")
      .reduce(
        (t, b) =>
          t +
          (cumulativeMode ? (b.openingDebitCents ?? 0) - (b.openingCreditCents ?? 0) : 0) +
          (cumulativeMode ? b.debitCents - b.creditCents : 0),
        0,
      );
  const openingCash = balances
    .filter((b) => b.subtype === "cash")
    .reduce((t, b) => t + (b.openingDebitCents ?? 0) - (b.openingCreditCents ?? 0), 0);
  const cash = cashFlowStatement(
    input.periodStart,
    input.periodEnd,
    movements,
    openingCash,
    cashBalance(balances, true),
  );

  const period = await periodFor(book.id, input.periodEnd);
  const nav = await approvedNav(offeringId, input.periodEnd);
  const allocations = await finalizedAllocations(offeringId, input.periodEnd);
  const unmapped = unmappedAccounts([...chart.values()], mapping);

  const exceptions = reportingExceptions({
    basis,
    trialBalance: tb,
    balanceSheet: bs,
    capital,
    navNetAssetsCents: nav ? Number(nav.net_asset_value_cents ?? 0) : null,
    navStatus: nav?.status ?? null,
    investorCapitalTotalCents: allocations.investorCapitalTotalCents,
    allocationStatus: allocations.run?.status ?? null,
    periodStatus: period?.status ?? null,
    unmapped,
    cashFlow: cash,
  });

  void capitalLine;

  return {
    fundId: offeringId,
    bookId: book.id as string,
    basis,
    mappingVersionId,
    mappingVersion: mapping.version,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    period,
    glCutoffAt: nowIso(),
    trialBalance: tb,
    balanceSheet: bs,
    incomeStatement: ops,
    changesInCapital: capital,
    cashFlow: cash,
    scheduleOfInvestments: schedule,
    comparatives: {
      priorPeriod: {
        bounds: priorBounds,
        netAssetsCents: priorBs.netAssetsCents,
        netIncreaseCents: priorOps.netIncreaseCents,
        mappingVersion: mapping.version,
        comparable: comparableMapping(mapping.version, mapping.version),
      },
      yearToDate: {
        start: yearStart(input.periodEnd),
        netIncreaseCents: ytdOps.netIncreaseCents,
      },
      inceptionToDate: { netAssetsCents: bs.netAssetsCents },
    },
    nav: nav
      ? { id: nav.id as string, version: Number(nav.version), netAssetsCents: Number(nav.net_asset_value_cents ?? 0), status: nav.status }
      : null,
    allocationRun: allocations.run
      ? { id: allocations.run.id as string, version: Number(allocations.run.version) }
      : null,
    investorCapitalTotalCents: allocations.investorCapitalTotalCents,
    valuationVersions: holdings
      .filter((h) => h.valuationId)
      .map((h) => ({ assetId: h.assetId, valuationId: h.valuationId, version: h.valuationVersion })),
    exceptions,
    blocking: blockingExceptions(exceptions),
  };
}

// --------------------------------------------------------- persistence

function statementLines(set: StatementSet): StatementLine[] {
  const lines: StatementLine[] = [];
  lines.push(...set.balanceSheet.lines);
  lines.push({
    statement: "balance_sheet",
    section: "capital",
    key: "net_assets",
    label: "Net assets",
    order: 999,
    amountCents: set.balanceSheet.netAssetsCents,
    isTotal: true,
    accountCodes: [],
    provenance: { accountIds: [], mappingVersion: set.mappingVersion },
  });
  lines.push(...set.incomeStatement.lines);
  lines.push({
    statement: "income_statement",
    section: "total",
    key: "net_increase",
    label: "Net increase from operations",
    order: 999,
    amountCents: set.incomeStatement.netIncreaseCents,
    isTotal: true,
    accountCodes: [],
    provenance: { accountIds: [], mappingVersion: set.mappingVersion },
  });
  const capital = set.changesInCapital;
  const capitalRows: [string, string, number][] = [
    ["beginning", "Beginning partners' capital", capital.beginningCents],
    ["contributions", "Contributions", capital.contributionsCents],
    ["distributions", "Distributions", -capital.distributionsCents],
    ["net_operations", "Net increase from operations", capital.netOperationsCents],
    ["other_activity", "Other capital activity", capital.otherActivityCents],
    ["ending", "Ending partners' capital", capital.endingCents],
  ];
  capitalRows.forEach(([key, label, amount], index) => {
    lines.push({
      statement: "changes_in_capital",
      section: "capital",
      key,
      label,
      order: (index + 1) * 10,
      amountCents: amount,
      isTotal: key === "ending",
      accountCodes: [],
      provenance: { accountIds: [], mappingVersion: set.mappingVersion },
    });
  });
  return lines;
}

/**
 * Prepare and persist the statement set as versioned reports. Re-preparing
 * before review refreshes the open draft instead of stacking clutter.
 */
export async function prepareFinancialStatements(
  userId: string,
  input: {
    offeringId: string;
    periodStart: string;
    periodEnd: string;
    basis?: ReportingBasis;
    statements?: StatementKind[];
  },
) {
  await assertHarmonious(userId);
  const set = await financialStatementsForPeriod(userId, input.offeringId, input);
  const wanted: StatementKind[] = input.statements ?? [
    "balance_sheet",
    "income_statement",
    "changes_in_capital",
    "cash_flow",
    "schedule_of_investments",
    "trial_balance",
  ];

  const created: { statement: StatementKind; reportId: string; version: number }[] = [];

  for (const statement of wanted) {
    const reportType = REPORT_TYPE_FOR[statement];
    const { data: existing } = await db()
      .from("financial_reports")
      .select("id, version, status")
      .eq("book_id", set.bookId)
      .eq("report_type", reportType)
      .eq("period_end", input.periodEnd)
      .order("version", { ascending: false })
      .limit(1);
    const previous = (existing ?? [])[0] ?? null;
    const reusable = previous && ["draft", "prepared"].includes(previous.status);

    const payload = {
      statement,
      label: STATEMENT_LABELS[statement],
      trialBalance: statement === "trial_balance" ? set.trialBalance : undefined,
      balanceSheet: statement === "balance_sheet" ? set.balanceSheet : undefined,
      incomeStatement: statement === "income_statement" ? set.incomeStatement : undefined,
      changesInCapital: statement === "changes_in_capital" ? set.changesInCapital : undefined,
      cashFlow: statement === "cash_flow" ? set.cashFlow : undefined,
      scheduleOfInvestments:
        statement === "schedule_of_investments" ? set.scheduleOfInvestments : undefined,
    };

    const common = {
      book_id: set.bookId,
      domain: "fund_accounting",
      offering_id: input.offeringId,
      report_type: reportType,
      period_id: set.period?.id ?? null,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      basis: set.basis,
      mapping_version_id: set.mappingVersionId,
      mapping_version: set.mappingVersion,
      gl_cutoff_at: set.glCutoffAt,
      source_cutoff_at: set.glCutoffAt,
      nav_version_id: set.nav?.id ?? null,
      allocation_run_id: set.allocationRun?.id ?? null,
      valuation_versions: set.valuationVersions,
      comparatives: set.comparatives,
      reconciliations: {
        navNetAssetsCents: set.nav?.netAssetsCents ?? null,
        investorCapitalTotalCents: set.investorCapitalTotalCents,
        trialBalanceDifferenceCents: set.trialBalance.differenceCents,
      },
      exceptions: set.exceptions,
      accounting_snapshot: {
        trialBalance: set.trialBalance,
        mappingVersion: set.mappingVersion,
        period: set.period,
      },
      payload,
      status: "prepared",
      prepared_by: userId,
      prepared_at: nowIso(),
      generated_by: userId,
      updated_at: nowIso(),
    };

    let reportId: string;
    let version: number;
    if (reusable) {
      const { data, error } = await db()
        .from("financial_reports")
        .update(common)
        .eq("id", previous.id)
        .select("id, version")
        .single();
      if (error) fail(error.message);
      reportId = data.id;
      version = Number(data.version);
      await db().from("report_lines").delete().eq("report_id", reportId);
    } else {
      const { data, error } = await db()
        .from("financial_reports")
        .insert({
          ...common,
          version: previous ? Number(previous.version) + 1 : 1,
          supersedes_id: previous && previous.status === "published" ? previous.id : null,
        })
        .select("id, version")
        .single();
      if (error) fail(error.message);
      reportId = data.id;
      version = Number(data.version);
    }

    const rows = statementLines(set).filter((l) => l.statement === statement);
    if (rows.length > 0) {
      await db()
        .from("report_lines")
        .insert(
          rows.map((l) => ({
            report_id: reportId,
            statement: l.statement,
            section: l.section,
            line_key: l.key,
            label: l.label,
            sort_order: l.order,
            amount_cents: l.amountCents,
            is_total: Boolean(l.isTotal),
            account_codes: l.accountCodes,
            provenance: l.provenance,
          })),
        );
    }

    await db().from("report_exceptions").delete().eq("report_id", reportId).eq("status", "open");
    if (set.exceptions.length > 0) {
      await db()
        .from("report_exceptions")
        .insert(
          set.exceptions.map((e) => ({
            report_id: reportId,
            book_id: set.bookId,
            offering_id: input.offeringId,
            period_end: input.periodEnd,
            kind: e.kind,
            severity: e.severity,
            detail: e.detail,
            context: e.context ?? {},
          })),
        );
    }

    created.push({ statement, reportId, version });
  }

  await ensureCloseChecklist(userId, input.offeringId, input.periodEnd);
  return { reports: created, exceptions: set.exceptions, set };
}

/** draft → prepared → review → approved → published, with segregation. */
export async function advanceFinancialReport(
  userId: string,
  reportId: string,
  to: FinancialReportStatus,
  reason?: string,
) {
  const { report } = await authorizeReport(userId, reportId);
  const from = report.status as FinancialReportStatus;
  if (!canTransitionFinancialReport(from, to)) fail(`A ${from} report cannot move to ${to}.`);

  const actors = {
    preparedBy: report.prepared_by ?? report.generated_by ?? null,
    reviewedBy: report.reviewed_by ?? null,
    approvedBy: report.approved_by ?? null,
    publishedBy: report.published_by ?? null,
  };

  if (to === "review" || to === "approved") {
    await assertHarmonious(userId);
    const problem = segregationError(actors, to === "review" ? "review" : "approve", userId);
    if (problem) fail(problem);
  }

  if (to === "published") {
    await assertHarmonious(userId);
    const checklist = await checklistItems(report.book_id, report.period_end);
    const exceptions = (report.exceptions ?? []) as any[];
    const blockers = publicationBlockers({
      status: "approved",
      exceptions,
      checklist,
    });
    if (from !== "approved") blockers.push("Only an approved report can be published.");
    if (blockers.length > 0) fail(blockers[0]!);
    const missing = missingStatementProvenance({
      ...report,
      published_by: userId,
      published_at: nowIso(),
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
    .from("financial_reports")
    .update(patch)
    .eq("id", reportId)
    .eq("status", from)
    .select("*")
    .single();
  if (error) fail(error.message);

  if (to === "published" && report.supersedes_id) {
    await db()
      .from("financial_reports")
      .update({ status: "superseded", superseded_by_id: reportId })
      .eq("id", report.supersedes_id)
      .eq("status", "published");
  }
  return data;
}

/** A correction never touches the published report: it starts a new version. */
export async function reviseFinancialReport(userId: string, reportId: string, reason: string) {
  await assertHarmonious(userId);
  if (!reason || reason.trim().length < 10) {
    fail("Please record why the published statements are being amended.");
  }
  const { report } = await authorizeReport(userId, reportId);
  if (report.status !== "published") fail("Only a published report can be amended.");

  const statement = (report.payload?.statement ?? "balance_sheet") as StatementKind;
  const prepared = await prepareFinancialStatements(userId, {
    offeringId: report.offering_id,
    periodStart: report.period_start,
    periodEnd: report.period_end,
    basis: report.basis as ReportingBasis,
    statements: [statement],
  });
  const next = prepared.reports[0];
  if (next) {
    await db()
      .from("financial_reports")
      .update({ supersedes_id: reportId, revision_reason: reason })
      .eq("id", next.reportId);
  }
  return { reportId: next?.reportId ?? null, reason };
}

/** Managers may acknowledge or challenge, never edit. */
export async function managerRespondToReport(
  userId: string,
  reportId: string,
  response: "acknowledged" | "challenged",
  note?: string,
) {
  const { report, scope } = await authorizeReport(userId, reportId);
  if (scope.isAdmin) fail("This action is for the fund's manager.");
  if (!["published", "superseded"].includes(report.status) || !report.manager_visible) {
    fail("That report has not been published to you.");
  }
  if (response === "challenged" && (!note || note.trim().length < 10)) {
    fail("Please describe what looks wrong.");
  }
  const { data, error } = await db()
    .from("financial_reports")
    .update({
      manager_response: response,
      manager_note: note ?? null,
      manager_responded_by: userId,
      manager_responded_at: nowIso(),
    })
    .eq("id", reportId)
    .select("id, manager_response")
    .single();
  if (error) fail(error.message);
  return data;
}

export async function setReportVisibility(
  userId: string,
  reportId: string,
  input: { managerVisible?: boolean; investorVisible?: boolean },
) {
  await assertHarmonious(userId);
  const { report } = await authorizeReport(userId, reportId);
  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (input.managerVisible !== undefined) patch['manager_visible'] = input.managerVisible;
  if (input.investorVisible !== undefined) {
    const internal = ["trial_balance", "general_ledger", "audit_support", "expense_report"];
    if (input.investorVisible && internal.includes(report.report_type)) {
      fail("Internal accounting reports are never published to investors.");
    }
    patch['investor_visible'] = input.investorVisible;
  }
  const { data, error } = await db()
    .from("financial_reports")
    .update(patch)
    .eq("id", reportId)
    .select("id, manager_visible, investor_visible")
    .single();
  if (error) fail(error.message);
  return data;
}

// ----------------------------------------------------------- provenance

/** Financial statement line → accounts → journals → lines → source records. */
export async function statementLineProvenance(userId: string, reportId: string, lineKey: string) {
  const { report } = await authorizeReport(userId, reportId);
  const { data: line } = await db()
    .from("report_lines")
    .select("*")
    .eq("report_id", reportId)
    .eq("line_key", lineKey)
    .maybeSingle();
  if (!line) fail("That statement line is not part of this report.");

  const accountIds = ((line.provenance ?? {}).accountIds ?? []) as string[];
  if (accountIds.length === 0) {
    return { line, accounts: [], entries: [], lines: [], reconciliations: [] };
  }

  const { data: accounts } = await db()
    .from("chart_of_accounts")
    .select("id, code, name, account_type, subtype")
    .in("id", accountIds);

  const { data: entries } = await db()
    .from("journal_entries")
    .select("id, entry_no, entry_date, memo, source, source_table, source_id, status, posted_at")
    .eq("book_id", report.book_id)
    .eq("status", "posted")
    .lte("entry_date", report.period_end);
  const entryIds = ((entries ?? []) as any[]).map((e) => e.id);

  const { data: journalLines } = entryIds.length
    ? await db()
        .from("journal_lines")
        .select("id, entry_id, account_id, debit_cents, credit_cents, memo")
        .in("entry_id", entryIds)
        .in("account_id", accountIds)
    : { data: [] };

  const usedEntryIds = new Set(((journalLines ?? []) as any[]).map((l) => l.entry_id));
  const { data: reconciliations } = usedEntryIds.size
    ? await db()
        .from("bank_reconciliations")
        .select("id, bank_transaction_id, journal_entry_id, status, match_confidence, posted_at")
        .in("journal_entry_id", [...usedEntryIds])
    : { data: [] };

  return {
    line,
    accounts: accounts ?? [],
    entries: ((entries ?? []) as any[]).filter((e) => usedEntryIds.has(e.id)),
    lines: journalLines ?? [],
    reconciliations: reconciliations ?? [],
  };
}

// ------------------------------------------------------------ workpapers

async function checklistItems(bookId: string, periodEnd: string): Promise<ChecklistItem[]> {
  const { data } = await db()
    .from("close_checklist_items")
    .select("item_key, label, blocking, status")
    .eq("book_id", bookId)
    .eq("period_end", periodEnd);
  return ((data ?? []) as any[]).map((i) => ({
    item_key: i.item_key,
    label: i.label,
    blocking: Boolean(i.blocking),
    status: i.status,
  }));
}

/** Build the administrator workpapers for a period from their real sources. */
export async function generateWorkpapers(
  userId: string,
  input: { offeringId: string; periodStart: string; periodEnd: string },
) {
  await assertHarmonious(userId);
  const set = await financialStatementsForPeriod(userId, input.offeringId, input);
  const book = { id: set.bookId };

  const { data: reconciliations } = await db()
    .from("bank_reconciliations")
    .select("id, status, bank_transaction_id, journal_entry_id, posted_at")
    .eq("book_id", book.id);
  const recRows = (reconciliations ?? []) as any[];

  const { data: fees } = await db()
    .from("fee_calculations")
    .select("id, position_id, period_start, period_end, basis, basis_amount_cents, rate_bps, net_fee_cents, reconciled")
    .eq("offering_id", input.offeringId)
    .eq("period_end", input.periodEnd);

  const allocations = await finalizedAllocations(input.offeringId, input.periodEnd);

  const papers: {
    kind: WorkpaperKind;
    figures: Record<string, unknown>;
    sources: unknown[];
    exceptions: string[];
  }[] = [
    {
      kind: "cash_reconciliation",
      figures: {
        ledgerCashCents: set.cashFlow.closingCashCents,
        movements: set.cashFlow.netChangeCents,
        reconciles: set.cashFlow.reconciles,
      },
      sources: recRows.map((r) => ({ table: "bank_reconciliations", id: r.id, status: r.status })),
      exceptions: recRows.filter((r) => r.status !== "posted").map((r) => `Unposted reconciliation ${r.id}`),
    },
    {
      kind: "investment_rollforward",
      figures: {
        costCents: set.scheduleOfInvestments.totalCostCents,
        fairValueCents: set.scheduleOfInvestments.totalFairValueCents,
        unrealizedCents: set.scheduleOfInvestments.totalUnrealizedCents,
      },
      sources: set.scheduleOfInvestments.rows.map((r) => ({ table: "portfolio_assets", id: r.assetId })),
      exceptions: set.scheduleOfInvestments.rows
        .filter((r) => !r.valuationId)
        .map((r) => `No effective valuation for ${r.issuer}`),
    },
    {
      kind: "valuation_support",
      figures: { valuations: set.valuationVersions.length },
      sources: set.valuationVersions,
      exceptions: [],
    },
    {
      kind: "receivable_payable_support",
      figures: {
        receivablesCents:
          set.balanceSheet.lines.find((l) => l.key === "receivables")?.amountCents ?? 0,
        payablesCents: set.balanceSheet.lines.find((l) => l.key === "payables")?.amountCents ?? 0,
      },
      sources: [],
      exceptions: [],
    },
    {
      kind: "management_fee_calculation",
      figures: {
        feeCents: (fees ?? []).reduce((t: number, f: any) => t + Number(f.net_fee_cents ?? 0), 0),
        ledgerFeeCents:
          set.incomeStatement.lines.find((l) => l.key === "management_fees")?.amountCents ?? 0,
      },
      sources: (fees ?? []).map((f: any) => ({ table: "fee_calculations", id: f.id })),
      exceptions: (fees ?? [])
        .filter((f: any) => f.reconciled === false)
        .map((f: any) => `Fee calculation ${f.id} does not tie to the ledger`),
    },
    {
      kind: "expense_accruals",
      figures: {
        accruedExpensesCents:
          set.balanceSheet.lines.find((l) => l.key === "accrued_expenses")?.amountCents ?? 0,
        periodExpensesCents: set.incomeStatement.totalExpensesCents,
      },
      sources: [],
      exceptions: [],
    },
    {
      kind: "investor_capital_reconciliation",
      figures: {
        fundEndingCapitalCents: set.changesInCapital.endingCents,
        investorCapitalCents: set.investorCapitalTotalCents,
        differenceCents:
          set.investorCapitalTotalCents === null
            ? null
            : set.changesInCapital.endingCents - set.investorCapitalTotalCents,
      },
      sources: allocations.accounts.map((a) => ({ table: "capital_accounts", id: a.id })),
      exceptions:
        set.investorCapitalTotalCents === null
          ? ["Allocations are not finalized for this period."]
          : set.changesInCapital.endingCents === set.investorCapitalTotalCents
            ? []
            : ["Investor capital accounts do not tie to fund capital."],
    },
    {
      kind: "contributions_distributions",
      figures: {
        contributionsCents: set.changesInCapital.contributionsCents,
        distributionsCents: set.changesInCapital.distributionsCents,
      },
      sources: [],
      exceptions: [],
    },
    {
      kind: "nav_tie_out",
      figures: {
        statementNetAssetsCents: set.balanceSheet.netAssetsCents,
        navNetAssetsCents: set.nav?.netAssetsCents ?? null,
        navVersion: set.nav?.version ?? null,
      },
      sources: set.nav ? [{ table: "nav_versions", id: set.nav.id }] : [],
      exceptions: set.nav
        ? set.nav.netAssetsCents === set.balanceSheet.netAssetsCents
          ? []
          : ["Statements do not tie to the approved NAV."]
        : ["No approved NAV for this date."],
    },
  ];

  const saved: string[] = [];
  for (const paper of papers) {
    const { data: existing } = await db()
      .from("accounting_workpapers")
      .select("id, status")
      .eq("book_id", set.bookId)
      .eq("period_end", input.periodEnd)
      .eq("kind", paper.kind)
      .maybeSingle();
    const row = {
      book_id: set.bookId,
      offering_id: input.offeringId,
      period_id: set.period?.id ?? null,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      kind: paper.kind,
      title: paper.kind.replaceAll("_", " "),
      figures: paper.figures,
      source_records: paper.sources,
      exceptions: paper.exceptions,
      prepared_by: userId,
      prepared_at: nowIso(),
      updated_at: nowIso(),
    };
    if (existing && existing.status === "approved") {
      saved.push(existing.id);
      continue;
    }
    if (existing) {
      await db().from("accounting_workpapers").update(row).eq("id", existing.id);
      saved.push(existing.id);
    } else {
      const { data, error } = await db()
        .from("accounting_workpapers")
        .insert({ ...row, status: "prepared" })
        .select("id")
        .single();
      if (error) fail(error.message);
      saved.push(data.id);
    }
  }
  return { workpaperIds: saved, count: saved.length };
}

export async function listWorkpapers(userId: string, offeringId: string, periodEnd?: string) {
  await authorizeFund(userId, offeringId);
  const scope = await reviewerScope(userId);
  let query = db()
    .from("accounting_workpapers")
    .select("*")
    .eq("offering_id", offeringId)
    .order("period_end", { ascending: false });
  if (periodEnd) query = query.eq("period_end", periodEnd);
  const { data } = await query;
  const rows = (data ?? []) as any[];
  // Workpapers are Harmonious's own audit support; managers see only shared ones.
  return scope.isAdmin ? rows : rows.filter((w) => w.shared_with_manager);
}

export async function advanceWorkpaper(
  userId: string,
  workpaperId: string,
  to: WorkpaperStatus,
  note?: string,
) {
  await assertHarmonious(userId);
  const { data: paper } = await db()
    .from("accounting_workpapers")
    .select("id, offering_id, status, prepared_by")
    .eq("id", workpaperId)
    .maybeSingle();
  if (!paper) fail("Workpaper not found.");
  await authorizeFund(userId, paper.offering_id);

  const from = paper.status as WorkpaperStatus;
  if (!canTransitionWorkpaper(from, to)) fail(`A ${from} workpaper cannot move to ${to}.`);
  const problem = workpaperSignoffError({ preparedBy: paper.prepared_by, status: from }, userId, to);
  if (problem) fail(problem);

  const now = nowIso();
  const patch: Record<string, unknown> = { status: to, updated_at: now, note: note ?? null };
  if (to === "review") Object.assign(patch, { reviewed_by: userId, reviewed_at: now });
  if (to === "approved") Object.assign(patch, { signed_off_by: userId, signed_off_at: now });
  const { data, error } = await db()
    .from("accounting_workpapers")
    .update(patch)
    .eq("id", workpaperId)
    .eq("status", from)
    .select("*")
    .single();
  if (error) fail(error.message);
  return data;
}

// ------------------------------------------------------- close checklist

/** Create (and refresh) the close checklist for a period from live state. */
export async function ensureCloseChecklist(userId: string, offeringId: string, periodEnd: string) {
  await authorizeFund(userId, offeringId);
  const book = await ledgerBookForOffering(userId, offeringId);
  const period = await periodFor(book.id, periodEnd);

  const { data: existing } = await db()
    .from("close_checklist_items")
    .select("id, item_key, status")
    .eq("book_id", book.id)
    .eq("period_end", periodEnd);
  const have = new Map(((existing ?? []) as any[]).map((i) => [i.item_key, i]));

  const missing = CLOSE_CHECKLIST.filter((i) => !have.has(i.key)).map((i) => ({
    book_id: book.id,
    offering_id: offeringId,
    period_id: period?.id ?? null,
    period_end: periodEnd,
    item_key: i.key,
    label: i.label,
    blocking: i.blocking,
  }));
  if (missing.length > 0) {
    await db().from("close_checklist_items").insert(missing);
  }
  const { data } = await db()
    .from("close_checklist_items")
    .select("*")
    .eq("book_id", book.id)
    .eq("period_end", periodEnd)
    .order("item_key");
  return data ?? [];
}

export async function setCloseChecklistItem(
  userId: string,
  input: { itemId: string; status: "pending" | "complete" | "waived"; reason?: string },
) {
  await assertHarmonious(userId);
  const { data: item } = await db()
    .from("close_checklist_items")
    .select("id, offering_id, item_key, blocking, status")
    .eq("id", input.itemId)
    .maybeSingle();
  if (!item) fail("Checklist item not found.");
  await authorizeFund(userId, item.offering_id);
  if (input.status === "waived" && (!input.reason || input.reason.trim().length < 10)) {
    fail("Please record why this close item is being waived.");
  }
  const now = nowIso();
  const patch: Record<string, unknown> = { status: input.status, updated_at: now };
  if (input.status === "complete") Object.assign(patch, { completed_by: userId, completed_at: now });
  if (input.status === "waived") {
    Object.assign(patch, { waived_by: userId, waived_reason: input.reason ?? null });
  }
  const { data, error } = await db()
    .from("close_checklist_items")
    .update(patch)
    .eq("id", input.itemId)
    .select("*")
    .single();
  if (error) fail(error.message);
  return data;
}

// --------------------------------------------------------------- packages

export async function saveReportPackage(
  userId: string,
  input: {
    offeringId: string;
    name: string;
    packageType: "quarterly_lp" | "internal_accounting" | "audit" | "custom";
    audience: "harmonious" | "manager" | "investor";
    items?: { reportType: string; label: string }[];
  },
) {
  await assertHarmonious(userId);
  await authorizeFund(userId, input.offeringId);
  const book = await ledgerBookForOffering(userId, input.offeringId);
  const template =
    input.packageType === "custom" ? null : PACKAGE_TEMPLATES[input.packageType] ?? null;
  const { data, error } = await db()
    .from("report_packages")
    .insert({
      offering_id: input.offeringId,
      book_id: book.id,
      name: input.name || template?.name || "Reporting package",
      package_type: input.packageType,
      audience: input.audience,
      items: input.items ?? template?.items ?? [],
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  return data;
}

export async function listReportPackages(userId: string, offeringId: string) {
  await authorizeFund(userId, offeringId);
  const { data } = await db()
    .from("report_packages")
    .select("*")
    .eq("offering_id", offeringId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** A package run records exactly which report versions it shipped. */
export async function runReportPackage(
  userId: string,
  input: { packageId: string; periodStart: string; periodEnd: string },
) {
  await assertHarmonious(userId);
  const { data: pkg } = await db()
    .from("report_packages")
    .select("*")
    .eq("id", input.packageId)
    .maybeSingle();
  if (!pkg) fail("Reporting package not found.");
  await authorizeFund(userId, pkg.offering_id);

  const types = ((pkg.items ?? []) as any[]).map((i) => i.reportType);
  const { data: reports } = await db()
    .from("financial_reports")
    .select("id, report_type, version, mapping_version, nav_version_id, gl_cutoff_at, status")
    .eq("book_id", pkg.book_id)
    .eq("period_end", input.periodEnd)
    .in("report_type", types.length > 0 ? types : ["balance_sheet"]);

  const rows = ((reports ?? []) as any[]).filter((r) => r.status === "published");
  const manifest = packageManifest(
    rows.map((r) => ({
      reportType: r.report_type,
      version: Number(r.version),
      reportId: r.id,
      mappingVersion: r.mapping_version ?? null,
      navVersionId: r.nav_version_id ?? null,
      glCutoffAt: r.gl_cutoff_at ?? null,
    })),
  );

  const { data, error } = await db()
    .from("report_package_runs")
    .insert({
      package_id: pkg.id,
      offering_id: pkg.offering_id,
      book_id: pkg.book_id,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      audience: pkg.audience,
      status: rows.length === types.length ? "complete" : "incomplete",
      manifest,
      report_ids: rows.map((r) => r.id),
      prepared_by: userId,
      prepared_at: nowIso(),
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  return data;
}

// ----------------------------------------------------------- workspaces

/** The Harmonious financial reporting workspace, in one read. */
export async function reportingQueue(userId: string, offeringId?: string) {
  const scope = await assertHarmonious(userId);
  const fundFilter = offeringId ? [offeringId] : scope.isAdmin ? null : scope.offeringIds;
  if (offeringId) await authorizeFund(userId, offeringId);

  const apply = (query: any) =>
    fundFilter ? query.in("offering_id", fundFilter) : query;

  const [{ data: reports }, { data: exceptions }, { data: checklist }, { data: papers }] =
    await Promise.all([
      apply(
        db()
          .from("financial_reports")
          .select(
            "id, offering_id, report_type, period_start, period_end, version, status, basis, mapping_version, manager_response, manager_note, investor_visible, manager_visible, updated_at",
          )
          .eq("domain", "fund_accounting")
          .order("period_end", { ascending: false })
          .limit(200),
      ),
      apply(
        db()
          .from("report_exceptions")
          .select("*")
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(200),
      ),
      apply(
        db()
          .from("close_checklist_items")
          .select("*")
          .neq("status", "complete")
          .order("period_end", { ascending: false })
          .limit(200),
      ),
      apply(
        db()
          .from("accounting_workpapers")
          .select("id, offering_id, kind, period_end, status, exceptions")
          .order("period_end", { ascending: false })
          .limit(200),
      ),
    ]);

  const rows = (reports ?? []) as any[];
  const { data: funds } = await db().from("offerings").select("id, name");
  const nameById = new Map(((funds ?? []) as any[]).map((f) => [f.id, f.name]));

  const bucket = (status: string) => rows.filter((r) => r.status === status);
  return {
    funds: (funds ?? []) as { id: string; name: string }[],
    reports: rows.map((r) => ({ ...r, fundName: nameById.get(r.offering_id) ?? "—" })),
    awaitingPreparation: bucket("draft"),
    awaitingReview: bucket("prepared"),
    awaitingApproval: bucket("review"),
    readyToPublish: bucket("approved"),
    published: bucket("published"),
    superseded: bucket("superseded"),
    challenges: rows.filter((r) => r.manager_response === "challenged"),
    exceptions: exceptions ?? [],
    openCloseItems: checklist ?? [],
    workpapers: papers ?? [],
  };
}

/** Fund managers see published financials for the funds they manage. */
export async function managerFinancials(userId: string, offeringId?: string) {
  const scope = await reviewerScope(userId);
  if (scope.isAdmin) fail("This view is for fund managers.");
  const funds = offeringId ? [offeringId] : scope.offeringIds;
  if (offeringId) assertScopeAllows(scope, offeringId);
  if (funds.length === 0) return { funds: [], reports: [], packages: [] };

  const { data: reports } = await db()
    .from("financial_reports")
    .select(
      "id, offering_id, report_type, period_start, period_end, version, status, basis, payload, published_at, manager_response, manager_note",
    )
    .in("offering_id", funds)
    .eq("manager_visible", true)
    .in("status", ["published", "superseded"])
    .order("period_end", { ascending: false });

  const { data: runs } = await db()
    .from("report_package_runs")
    .select("id, offering_id, period_end, audience, status, manifest")
    .in("offering_id", funds)
    .order("period_end", { ascending: false })
    .limit(50);

  const { data: fundRows } = await db().from("offerings").select("id, name").in("id", funds);
  return {
    funds: (fundRows ?? []) as { id: string; name: string }[],
    reports: reports ?? [],
    packages: runs ?? [],
  };
}

/** Investors see only reports published to investors for funds they hold. */
export async function investorFinancials(userId: string) {
  const { data: positions } = await db()
    .from("investor_positions")
    .select("offering_id")
    .eq("investor_user_id", userId);
  const funds = [...new Set(((positions ?? []) as any[]).map((p) => p.offering_id))];
  if (funds.length === 0) return { funds: [], reports: [] };

  const { data: reports } = await db()
    .from("financial_reports")
    .select("id, offering_id, report_type, period_start, period_end, version, payload, published_at, subject_user_id")
    .in("offering_id", funds)
    .eq("investor_visible", true)
    .eq("status", "published")
    .order("period_end", { ascending: false });

  const mine = ((reports ?? []) as any[]).filter(
    (r) => !r.subject_user_id || r.subject_user_id === userId,
  );
  const { data: fundRows } = await db().from("offerings").select("id, name").in("id", funds);
  return { funds: (fundRows ?? []) as { id: string; name: string }[], reports: mine };
}

export async function financialReportDetail(userId: string, reportId: string) {
  const { report, scope } = await authorizeReport(userId, reportId);
  if (!scope.isAdmin) {
    const visible = ["published", "superseded"].includes(report.status) && report.manager_visible;
    if (!visible) fail("That report has not been published to you.");
  }
  const { data: lines } = await db()
    .from("report_lines")
    .select("*")
    .eq("report_id", reportId)
    .order("sort_order");
  const { data: exceptions } = await db()
    .from("report_exceptions")
    .select("*")
    .eq("report_id", reportId);
  const checklist = await checklistItems(report.book_id, report.period_end);
  return {
    report,
    lines: lines ?? [],
    exceptions: exceptions ?? [],
    checklist,
    closeBlockers: closeBlockers(checklist),
  };
}
