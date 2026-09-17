/**
 * Server-only fund accounting engine.
 *
 * Every write in this module runs with the privileged client, but only after
 * the caller's authority has been resolved server-side from user_roles and
 * fund_managers. Nothing trusts a book, period, fund or entry id sent by the
 * browser: each one is re-read and re-checked against the caller's real scope.
 *
 * Financial-control rules preserved here:
 *  - posted entries are never rewritten; corrections are reversing entries;
 *  - the same person cannot both approve and post an entry (maker-checker);
 *  - closed and locked periods refuse postings until an authorised reopen;
 *  - one bank transaction can only ever produce one posted journal entry.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reviewerScope, assertScopeAllows, type ReviewerScope } from "@/lib/reviewer-authz.server";
import {
  DEFAULT_FUND_CHART,
  assertBalanced,
  canTransitionJournal,
  canTransitionPeriod,
  canTransitionReport,
  domainForReport,
  isReportType,
  reopenRequiresReason,
  SEALED_PERIOD_STATUSES,
  type DraftLine,
  type JournalStatus,
  type PeriodStatus,
  type ReportStatus,
  type ReportType,
} from "@/lib/accounting-model";

const db = () => supabaseAdmin as any;

function fail(message: string): never {
  throw new Error(message);
}

async function assertAdmin(userId: string): Promise<ReviewerScope> {
  const scope = await reviewerScope(userId);
  if (!scope.isAdmin) fail("Forbidden: Harmonious accounting authority required.");
  return scope;
}

/** Resolve a book server-side and confirm the caller may act on its fund. */
async function authorizeBook(userId: string, bookId: string, opts?: { write?: boolean }) {
  const scope = await reviewerScope(userId);
  const { data: book } = await db()
    .from("ledger_books")
    .select("id, offering_id, client_id, domain, is_active")
    .eq("id", bookId)
    .maybeSingle();
  if (!book) fail("Accounting book not found.");
  if (!scope.isAdmin) {
    assertScopeAllows(scope, book.offering_id);
    if (opts?.write) {
      const { data: config } = await db()
        .from("ledger_books")
        .select("allocation_policy")
        .eq("id", bookId)
        .maybeSingle();
      const allowed = Boolean((config?.allocation_policy ?? {}).manager_approval_enabled);
      if (!allowed) fail("Forbidden: this fund's accounting is approved by Harmonious.");
    }
  }
  return { scope, book };
}

// ------------------------------------------------------------ books & chart

export async function openLedgerBook(
  userId: string,
  input: {
    name: string;
    offeringId?: string | null;
    clientId?: string | null;
    clientEntityId?: string | null;
    ctCompanyId?: string | null;
    domain?: "fund_accounting" | "cap_table";
    basis?: "accrual" | "cash" | "tax";
    fiscalYearEndMonth?: number;
  },
) {
  await assertAdmin(userId);
  const { data, error } = await db()
    .from("ledger_books")
    .insert({
      name: input.name,
      offering_id: input.offeringId ?? null,
      client_id: input.clientId ?? null,
      client_entity_id: input.clientEntityId ?? null,
      ct_company_id: input.ctCompanyId ?? null,
      domain: input.domain ?? "fund_accounting",
      basis: input.basis ?? "accrual",
      fiscal_year_end_month: input.fiscalYearEndMonth ?? 12,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  await seedChartOfAccounts(data.id);
  return data;
}

/** Idempotent: a book always has exactly one canonical chart. */
export async function seedChartOfAccounts(bookId: string) {
  const { data: existing } = await db()
    .from("chart_of_accounts")
    .select("code")
    .eq("book_id", bookId);
  const have = new Set(((existing ?? []) as { code: string }[]).map((a) => a.code));
  const rows = DEFAULT_FUND_CHART.filter((a) => !have.has(a.code)).map((a) => ({
    book_id: bookId,
    code: a.code,
    name: a.name,
    account_type: a.account_type,
    subtype: a.subtype,
    normal_balance: a.normal_balance,
  }));
  if (rows.length === 0) return [];
  const { data, error } = await db().from("chart_of_accounts").insert(rows).select("*");
  if (error) fail(error.message);
  return data;
}

/** The book for a fund, opened on first use so reporting always has a home. */
export async function ledgerBookForOffering(userId: string, offeringId: string) {
  const scope = await reviewerScope(userId);
  assertScopeAllows(scope, offeringId);
  const { data: existing } = await db()
    .from("ledger_books")
    .select("*")
    .eq("offering_id", offeringId)
    .eq("domain", "fund_accounting")
    .maybeSingle();
  if (existing) return existing;
  if (!scope.isAdmin) fail("This fund's accounting has not been opened by Harmonious yet.");
  const { data: offering } = await db()
    .from("offerings")
    .select("id, name, client_id")
    .eq("id", offeringId)
    .maybeSingle();
  if (!offering) fail("Fund not found.");
  return openLedgerBook(userId, {
    name: `${offering.name} — fund accounting`,
    offeringId,
    clientId: offering.client_id,
  });
}

// ---------------------------------------------------------------- periods

export async function openPeriod(
  userId: string,
  input: { bookId: string; label: string; periodStart: string; periodEnd: string },
) {
  await assertAdmin(userId);
  await authorizeBook(userId, input.bookId);
  const { data, error } = await db()
    .from("accounting_periods")
    .insert({
      book_id: input.bookId,
      label: input.label,
      period_start: input.periodStart,
      period_end: input.periodEnd,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  await db().from("accounting_period_events").insert({
    period_id: data.id,
    actor_user_id: userId,
    from_status: null,
    to_status: "open",
  });
  return data;
}

export async function transitionPeriod(
  userId: string,
  periodId: string,
  to: PeriodStatus,
  reason?: string,
) {
  const { data: period } = await db()
    .from("accounting_periods")
    .select("id, book_id, status")
    .eq("id", periodId)
    .maybeSingle();
  if (!period) fail("Accounting period not found.");
  await authorizeBook(userId, period.book_id);

  const from = period.status as PeriodStatus;
  if (!canTransitionPeriod(from, to)) fail(`A ${from} period cannot move to ${to}.`);
  // Closing, locking and reopening are Harmonious authority.
  if (["closed", "locked"].includes(to) || reopenRequiresReason(from, to)) {
    await assertAdmin(userId);
  }
  if (reopenRequiresReason(from, to) && !reason?.trim()) {
    fail("Reopening a closed period requires a stated reason.");
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to, updated_at: now };
  if (to === "soft_closed") Object.assign(patch, { soft_closed_at: now, soft_closed_by: userId });
  if (to === "review") patch['review_started_at'] = now;
  if (to === "closed") Object.assign(patch, { closed_at: now, closed_by: userId });
  if (to === "locked") Object.assign(patch, { locked_at: now, locked_by: userId });
  if (to === "open" && SEALED_PERIOD_STATUSES.includes(from)) {
    Object.assign(patch, { reopened_at: now, reopened_by: userId, reopen_reason: reason });
  }

  const { data, error } = await db()
    .from("accounting_periods")
    .update(patch)
    .eq("id", periodId)
    .select("*")
    .single();
  if (error) fail(error.message);
  await db().from("accounting_period_events").insert({
    period_id: periodId,
    actor_user_id: userId,
    from_status: from,
    to_status: to,
    reason: reason ?? null,
  });
  return data;
}

async function periodFor(bookId: string, entryDate: string) {
  const { data } = await db()
    .from("accounting_periods")
    .select("id, status")
    .eq("book_id", bookId)
    .lte("period_start", entryDate)
    .gte("period_end", entryDate)
    .maybeSingle();
  return data ?? null;
}

// ---------------------------------------------------------------- journals

export async function draftJournalEntry(
  userId: string,
  input: {
    bookId: string;
    entryDate: string;
    memo?: string;
    source?: string;
    sourceTable?: string | null;
    sourceId?: string | null;
    reversesEntryId?: string | null;
    adjustsEntryId?: string | null;
    lines: DraftLine[];
  },
) {
  const { book } = await authorizeBook(userId, input.bookId, { write: true });
  assertBalanced(input.lines);

  const period = await periodFor(input.bookId, input.entryDate);
  if (period && SEALED_PERIOD_STATUSES.includes(period.status as PeriodStatus)) {
    fail("That accounting period is closed. Reopen it with an authorised adjustment first.");
  }

  // Accounts must belong to this book — no borrowing another fund's chart.
  const accountIds = [...new Set(input.lines.map((l) => l.accountId))];
  const { data: accounts } = await db()
    .from("chart_of_accounts")
    .select("id")
    .eq("book_id", input.bookId)
    .in("id", accountIds);
  if ((accounts ?? []).length !== accountIds.length) {
    fail("One or more accounts do not belong to this accounting book.");
  }

  const { data: entry, error } = await db()
    .from("journal_entries")
    .insert({
      book_id: input.bookId,
      period_id: period?.id ?? null,
      entry_date: input.entryDate,
      memo: input.memo ?? null,
      source: input.source ?? "manual",
      source_table: input.sourceTable ?? null,
      source_id: input.sourceId ?? null,
      reverses_entry_id: input.reversesEntryId ?? null,
      adjusts_entry_id: input.adjustsEntryId ?? null,
      prepared_by: userId,
      status: "draft",
    })
    .select("*")
    .single();
  if (error) fail(error.message);

  const lines = input.lines.map((l, i) => ({
    entry_id: entry.id,
    line_no: i + 1,
    account_id: l.accountId,
    debit_cents: l.debitCents ?? 0,
    credit_cents: l.creditCents ?? 0,
    offering_id: l.offeringId ?? book.offering_id ?? null,
    client_entity_id: l.clientEntityId ?? null,
    investment_id: l.investmentId ?? null,
    investor_user_id: l.investorUserId ?? null,
    investment_profile_id: l.investmentProfileId ?? null,
    application_id: l.applicationId ?? null,
    memo: l.memo ?? null,
  }));
  const { error: lineError } = await db().from("journal_lines").insert(lines);
  if (lineError) fail(lineError.message);

  await db().from("journal_entry_events").insert({
    entry_id: entry.id,
    actor_user_id: userId,
    from_status: null,
    to_status: "draft",
    snapshot: { lines },
  });
  return entry;
}

export async function advanceJournalEntry(
  userId: string,
  entryId: string,
  to: JournalStatus,
  reason?: string,
) {
  const { data: entry } = await db()
    .from("journal_entries")
    .select("id, book_id, period_id, status, prepared_by, approved_by")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) fail("Journal entry not found.");
  await authorizeBook(userId, entry.book_id, { write: true });

  const from = entry.status as JournalStatus;
  if (!canTransitionJournal(from, to)) fail(`A ${from} entry cannot move to ${to}.`);

  if (to === "approved" && entry.prepared_by === userId) {
    fail("An entry must be approved by someone other than the person who prepared it.");
  }
  if (to === "posted") {
    await assertAdmin(userId);
    if (entry.approved_by === userId) {
      fail("An entry must be posted by someone other than its approver.");
    }
    const { data: lines } = await db()
      .from("journal_lines")
      .select("debit_cents, credit_cents")
      .eq("entry_id", entryId);
    assertBalanced(
      ((lines ?? []) as any[]).map((l) => ({
        accountId: "x",
        debitCents: l.debit_cents,
        creditCents: l.credit_cents,
      })),
    );
    if (entry.period_id) {
      const { data: period } = await db()
        .from("accounting_periods")
        .select("status")
        .eq("id", entry.period_id)
        .maybeSingle();
      if (period && SEALED_PERIOD_STATUSES.includes(period.status as PeriodStatus)) {
        fail("That accounting period is closed. Reopen it with an authorised adjustment first.");
      }
    }
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to, updated_at: now };
  if (to === "reviewed") Object.assign(patch, { reviewed_by: userId, reviewed_at: now });
  if (to === "approved") Object.assign(patch, { approved_by: userId, approved_at: now });
  if (to === "posted") Object.assign(patch, { posted_by: userId, posted_at: now });

  const { data, error } = await db()
    .from("journal_entries")
    .update(patch)
    .eq("id", entryId)
    .select("*")
    .single();
  if (error) fail(error.message);

  await db().from("journal_entry_events").insert({
    entry_id: entryId,
    actor_user_id: userId,
    from_status: from,
    to_status: to,
    reason: reason ?? null,
  });
  return data;
}

/** Corrections never rewrite history: they post an opposite entry. */
export async function reverseJournalEntry(userId: string, entryId: string, reason: string) {
  await assertAdmin(userId);
  if (!reason?.trim()) fail("A reversal requires a stated reason.");
  const { data: entry } = await db()
    .from("journal_entries")
    .select("id, book_id, status, entry_date, memo")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) fail("Journal entry not found.");
  if (entry.status !== "posted") fail("Only a posted entry can be reversed.");

  const { data: lines } = await db().from("journal_lines").select("*").eq("entry_id", entryId);
  const flipped: DraftLine[] = ((lines ?? []) as any[]).map((l) => ({
    accountId: l.account_id,
    debitCents: l.credit_cents,
    creditCents: l.debit_cents,
    offeringId: l.offering_id,
    clientEntityId: l.client_entity_id,
    investmentId: l.investment_id,
    investorUserId: l.investor_user_id,
    investmentProfileId: l.investment_profile_id,
    applicationId: l.application_id,
    memo: l.memo,
  }));

  const reversal = await draftJournalEntry(userId, {
    bookId: entry.book_id,
    entryDate: new Date().toISOString().slice(0, 10),
    memo: `Reversal of ${entry.memo ?? entryId}: ${reason}`,
    source: "reversal",
    reversesEntryId: entryId,
    lines: flipped,
  });

  await db().from("journal_entry_events").insert({
    entry_id: entryId,
    actor_user_id: userId,
    from_status: "posted",
    to_status: "posted",
    reason: `Reversal drafted as ${reversal.id}: ${reason}`,
  });
  return reversal;
}

// -------------------------------------------------- reconciliation → ledger

export async function upsertBankReconciliation(
  userId: string,
  input: {
    bankTransactionId: string;
    status?: string;
    matchedApplicationId?: string | null;
    matchedPaymentId?: string | null;
    matchedInvoiceId?: string | null;
    matchedWireRequestId?: string | null;
    autoMatched?: boolean;
    acknowledgementRequired?: boolean;
    note?: string | null;
  },
) {
  const { data: txn } = await db()
    .from("bank_transactions")
    .select("id, offering_id")
    .eq("id", input.bankTransactionId)
    .maybeSingle();
  if (!txn) fail("Bank transaction not found.");
  const scope = await reviewerScope(userId);
  assertScopeAllows(scope, txn.offering_id);

  const { data: book } = await db()
    .from("ledger_books")
    .select("id")
    .eq("offering_id", txn.offering_id)
    .eq("domain", "fund_accounting")
    .maybeSingle();

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    bank_transaction_id: txn.id,
    offering_id: txn.offering_id,
    book_id: book?.id ?? null,
    status: input.status ?? "auto_matched",
    matched_application_id: input.matchedApplicationId ?? null,
    matched_payment_id: input.matchedPaymentId ?? null,
    matched_invoice_id: input.matchedInvoiceId ?? null,
    matched_wire_request_id: input.matchedWireRequestId ?? null,
    auto_matched: input.autoMatched ?? false,
    acknowledgement_required: input.acknowledgementRequired ?? false,
    note: input.note ?? null,
    updated_at: now,
  };
  if (input.status === "harmonious_reviewed") {
    Object.assign(patch, { reviewed_by: userId, reviewed_at: now });
  }
  if (input.status === "acknowledged") {
    Object.assign(patch, { acknowledged_by: userId, acknowledged_at: now });
  }
  if (input.status === "reconciled") {
    Object.assign(patch, { reconciled_by: userId, reconciled_at: now });
  }

  const { data, error } = await db()
    .from("bank_reconciliations")
    .upsert(patch, { onConflict: "bank_transaction_id" })
    .select("*")
    .single();
  if (error) fail(error.message);
  return data;
}

/**
 * Posts one reconciled bank transaction to the ledger, once and only once.
 * Re-running returns the existing entry instead of double-counting the cash.
 */
export async function postReconciliationToLedger(
  userId: string,
  input: {
    bankTransactionId: string;
    cashAccountCode: string;
    counterAccountCode: string;
    memo?: string;
  },
) {
  await assertAdmin(userId);
  const { data: rec } = await db()
    .from("bank_reconciliations")
    .select("*")
    .eq("bank_transaction_id", input.bankTransactionId)
    .maybeSingle();
  if (!rec) fail("That bank transaction has not been reconciled yet.");
  if (rec.journal_entry_id) return { entryId: rec.journal_entry_id, alreadyPosted: true };
  if (!["reconciled", "acknowledged"].includes(rec.status)) {
    fail("Only a reconciled bank transaction can be posted to the ledger.");
  }
  if (!rec.book_id) fail("This fund's accounting book has not been opened yet.");

  const { data: txn } = await db()
    .from("bank_transactions")
    .select("id, offering_id, amount_cents, posted_on, name")
    .eq("id", input.bankTransactionId)
    .maybeSingle();
  if (!txn) fail("Bank transaction not found.");

  const { data: accounts } = await db()
    .from("chart_of_accounts")
    .select("id, code")
    .eq("book_id", rec.book_id)
    .in("code", [input.cashAccountCode, input.counterAccountCode]);
  const byCode = new Map(((accounts ?? []) as any[]).map((a) => [a.code, a.id]));
  const cash = byCode.get(input.cashAccountCode);
  const counter = byCode.get(input.counterAccountCode);
  if (!cash || !counter) fail("Those accounts are not in this fund's chart of accounts.");

  const amount = Math.abs(Number(txn.amount_cents));
  const inflow = Number(txn.amount_cents) >= 0;
  const lines: DraftLine[] = inflow
    ? [
        { accountId: cash, debitCents: amount, applicationId: rec.matched_application_id },
        { accountId: counter, creditCents: amount, applicationId: rec.matched_application_id },
      ]
    : [
        { accountId: counter, debitCents: amount, applicationId: rec.matched_application_id },
        { accountId: cash, creditCents: amount, applicationId: rec.matched_application_id },
      ];

  const entry = await draftJournalEntry(userId, {
    bookId: rec.book_id,
    entryDate: txn.posted_on,
    memo: input.memo ?? `Bank activity: ${txn.name ?? "transaction"}`,
    source: "bank_reconciliation",
    sourceTable: "bank_transactions",
    sourceId: txn.id,
    lines,
  });

  const { error } = await db()
    .from("bank_reconciliations")
    .update({
      journal_entry_id: entry.id,
      status: "posted",
      posted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", rec.id)
    .is("journal_entry_id", null);
  if (error) fail("That bank transaction has already been posted to the ledger.");

  return { entryId: entry.id, alreadyPosted: false };
}

// ------------------------------------------------------------- report registry

export async function registerReport(
  userId: string,
  input: {
    bookId: string;
    reportType: ReportType;
    periodId?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    subjectUserId?: string | null;
    subjectProfileId?: string | null;
    ctCompanyId?: string | null;
    ctStakeholderId?: string | null;
    navVersionId?: string | null;
    methodologyVersion?: string;
    accountingSnapshot?: Record<string, unknown>;
    payload?: Record<string, unknown>;
    storagePath?: string | null;
  },
) {
  if (!isReportType(input.reportType)) fail("Unknown report type.");
  const { book } = await authorizeBook(userId, input.bookId);

  let priorQuery = db()
    .from("financial_reports")
    .select("id, version")
    .eq("book_id", input.bookId)
    .eq("report_type", input.reportType);
  priorQuery = input.periodEnd
    ? priorQuery.eq("period_end", input.periodEnd)
    : priorQuery.is("period_end", null);
  if (input.subjectUserId) priorQuery = priorQuery.eq("subject_user_id", input.subjectUserId);
  const { data: prior } = await priorQuery.order("version", { ascending: false }).limit(1);
  const previous = (prior ?? [])[0] ?? null;

  const { data, error } = await db()
    .from("financial_reports")
    .insert({
      book_id: input.bookId,
      domain: domainForReport(input.reportType),
      offering_id: book.offering_id,
      ct_company_id: input.ctCompanyId ?? book.ct_company_id ?? null,
      ct_stakeholder_id: input.ctStakeholderId ?? null,
      report_type: input.reportType,
      subject_user_id: input.subjectUserId ?? null,
      subject_profile_id: input.subjectProfileId ?? null,
      period_id: input.periodId ?? null,
      period_start: input.periodStart ?? null,
      period_end: input.periodEnd ?? null,
      version: previous ? previous.version + 1 : 1,
      status: "draft",
      source_cutoff_at: new Date().toISOString(),
      methodology_version: input.methodologyVersion ?? "v1",
      nav_version_id: input.navVersionId ?? null,
      accounting_snapshot: input.accountingSnapshot ?? {},
      payload: input.payload ?? {},
      storage_path: input.storagePath ?? null,
      generated_by: userId,
      supersedes_id: previous?.id ?? null,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  return data;
}

export async function advanceReport(userId: string, reportId: string, to: ReportStatus) {
  const { data: report } = await db()
    .from("financial_reports")
    .select("id, book_id, status, generated_by, approved_by, supersedes_id")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) fail("Report not found.");
  await authorizeBook(userId, report.book_id);

  const from = report.status as ReportStatus;
  if (!canTransitionReport(from, to)) fail(`A ${from} report cannot move to ${to}.`);
  if (to === "approved" && report.generated_by === userId) {
    fail("A report must be approved by someone other than the person who generated it.");
  }
  if (to === "published") await assertAdmin(userId);

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to, updated_at: now };
  if (to === "review") patch['reviewed_by'] = userId;
  if (to === "review") patch['reviewed_at'] = now;
  if (to === "approved") Object.assign(patch, { approved_by: userId, approved_at: now });
  if (to === "published") Object.assign(patch, { published_by: userId, published_at: now });

  const { data, error } = await db()
    .from("financial_reports")
    .update(patch)
    .eq("id", reportId)
    .select("*")
    .single();
  if (error) fail(error.message);

  // Publishing a new version retires the one it replaces, without altering it.
  if (to === "published" && report.supersedes_id) {
    await db()
      .from("financial_reports")
      .update({ status: "superseded", superseded_by_id: reportId })
      .eq("id", report.supersedes_id)
      .eq("status", "published");
  }
  return data;
}
