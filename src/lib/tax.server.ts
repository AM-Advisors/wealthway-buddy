/**
 * Server-only fund/entity tax engines.
 *
 * Tax is a separate subsystem that CONSUMES finalized accounting. Nothing here
 * rewrites book accounting, and nothing here files a return, transmits data to
 * a tax authority or moves money.
 *
 *   tax year ready → book-to-tax adjustments → tax allocation → 1065 draft
 *     → review → approval → ready_to_file
 *
 * Controls preserved:
 *  - investor tax allocations must reconcile to the partnership totals exactly;
 *  - K-1s come only from a finalized allocation run, never from a draft;
 *  - a final form is never rewritten — corrections supersede it;
 *  - the preparer of a return can never approve it;
 *  - missing or expired W-8 documentation routes to review at the statutory
 *    rate, never to a favourable assumption;
 *  - the same authoritative payment can never be reported twice;
 *  - full TIN values never enter this layer: only the last four digits.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  assertFundTaxAccess,
  assertFundTaxWrite,
  assertTaxStaff,
  forbid,
  recordTaxAccess,
  recordTaxEvent,
  resolveTaxViewer,
  subjectProfileIds,
  taxActor,
  type ViewerContext,
} from "@/lib/tax-authz.server";
import {
  assertNoRawTin,
  blockingExceptions,
  bookToTaxSummary,
  build1042sRecords,
  canTransition1099,
  canTransitionEntityReturn,
  canTransitionK1,
  canTransitionTaxWorkpaper,
  canTransitionTaxYear,
  determine1099,
  documentExpiry,
  documentValidityAsOf,
  duplicateReportedPayments,
  allocateTaxItems,
  expectedDocumentForms,
  isImmutableTaxForm,
  K1_BOX,
  maskTin,
  reconcile1042,
  reconcile1099Totals,
  reconcileTaxAllocations,
  segregationError,
  statusFromProvider,
  sumByItem,
  taxCloseReadiness,
  withheldCents,
  withholdingDecision,
  workpaperSignoffError,
  type Participant,
  type TaxException,
  type ProviderOperation,
} from "@/lib/tax-model";

const db = () => supabaseAdmin as any;
const nowIso = () => new Date().toISOString();
const num = (v: unknown) => Number(v ?? 0);

function fail(message: string): never {
  throw new Error(message);
}

async function rowOrFail(table: string, id: string, label: string) {
  const { data } = await db().from(table).select("*").eq("id", id).maybeSingle();
  if (!data) fail(`${label} not found.`);
  return data;
}

// ============================================================== tax years

export async function openTaxYear(
  userId: string,
  input: { offeringId: string; taxYear: number; periodStart?: string; periodEnd?: string },
) {
  await assertTaxStaff(userId);
  const { data: existing } = await db()
    .from("tax_years")
    .select("*")
    .eq("offering_id", input.offeringId)
    .eq("tax_year", input.taxYear)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await db()
    .from("tax_years")
    .insert({
      scope: "entity",
      offering_id: input.offeringId,
      tax_year: input.taxYear,
      period_start: input.periodStart ?? `${input.taxYear}-01-01`,
      period_end: input.periodEnd ?? `${input.taxYear}-12-31`,
      status: "not_started",
      opened_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  await recordTaxEvent({
    subjectTable: "tax_years",
    subjectId: data.id,
    taxYear: input.taxYear,
    offeringId: input.offeringId,
    event: "tax_year_opened",
    toStatus: "not_started",
    actorUserId: userId,
  });
  return data;
}

/** Recompute close readiness from the authoritative accounting records. */
export async function refreshTaxYearReadiness(userId: string, taxYearId: string) {
  const year = await rowOrFail("tax_years", taxYearId, "Tax year");
  await assertFundTaxAccess(userId, year.offering_id);

  const [periods, reports, nav, capital, allocations, valuations, documents] = await Promise.all([
    db().from("accounting_periods").select("id, status").eq("offering_id", year.offering_id),
    db().from("financial_reports").select("id, status").eq("offering_id", year.offering_id),
    db().from("nav_versions").select("id, status").eq("offering_id", year.offering_id),
    db().from("capital_accounts").select("id, status").eq("offering_id", year.offering_id),
    db().from("allocation_runs").select("id, status").eq("offering_id", year.offering_id),
    db().from("asset_valuations").select("id, status").eq("offering_id", year.offering_id),
    db().from("tax_document_records").select("*").eq("offering_id", year.offering_id),
  ]);

  const rows = (r: any) => (r?.data ?? []) as any[];
  const asOf = year.period_end ?? `${year.tax_year}-12-31`;
  const outstanding = rows(documents).filter(
    (d) => documentValidityAsOf(d.validation_status, d.expires_on, asOf) !== "valid",
  ).length;

  const exceptions = taxCloseReadiness({
    accountingPeriodsClosed: rows(periods).length > 0 && rows(periods).every((p) =>
      ["closed", "sealed", "locked"].includes(p.status),
    ),
    financialStatementsFinal: rows(reports).some((r) => ["approved", "published"].includes(r.status)),
    navFinal: rows(nav).some((n) => ["approved", "published"].includes(n.status)),
    navApplicable: rows(nav).length > 0,
    capitalAccountsFinalized: rows(capital).length === 0
      ? false
      : rows(capital).every((c) => ["finalized", "published"].includes(c.status)),
    capitalActivityFinalized: rows(allocations).some((a) => a.status === "finalized"),
    ownershipHistoryComplete: true,
    valuationsFinal: rows(valuations).every((v) => ["effective", "superseded"].includes(v.status)),
    valuationsApplicable: rows(valuations).length > 0,
    taxDocumentsOutstanding: outstanding,
    unclassifiedTransactions: 0,
    documentExceptionsRecorded: Boolean((year.readiness ?? {}).documentExceptionsRecorded),
  });

  const { data } = await db()
    .from("tax_years")
    .update({
      exceptions,
      readiness: { ...(year.readiness ?? {}), checkedAt: nowIso(), outstandingDocuments: outstanding },
      updated_at: nowIso(),
    })
    .eq("id", taxYearId)
    .select("*")
    .single();
  return { taxYear: data ?? year, exceptions };
}

export async function transitionTaxYear(userId: string, taxYearId: string, to: string) {
  await assertTaxStaff(userId);
  const year = await rowOrFail("tax_years", taxYearId, "Tax year");
  if (!canTransitionTaxYear(year.status, to)) {
    fail(`A tax year cannot move from ${year.status} to ${to}.`);
  }
  if (to === "accounting_ready") {
    const { exceptions } = await refreshTaxYearReadiness(userId, taxYearId);
    if (blockingExceptions(exceptions).length > 0) {
      fail("The accounting year is not ready: resolve the blocking exceptions first.");
    }
  }
  const { data } = await db()
    .from("tax_years")
    .update({ status: to, updated_at: nowIso() })
    .eq("id", taxYearId)
    .select("*")
    .single();
  await recordTaxEvent({
    subjectTable: "tax_years",
    subjectId: taxYearId,
    taxYear: year.tax_year,
    offeringId: year.offering_id,
    event: "tax_year_status",
    fromStatus: year.status,
    toStatus: to,
    actorUserId: userId,
  });
  return data;
}

// ================================================= tax identity documents

export async function recordTaxDocument(
  userId: string,
  input: {
    investmentProfileId?: string | null;
    personId?: string | null;
    subjectUserId?: string | null;
    offeringId?: string | null;
    formType: string;
    classification?: string | null;
    tinType?: string | null;
    /** Last four digits only. A full TIN is refused. */
    tinLast4?: string | null;
    certificationDate?: string | null;
    receivedDate?: string | null;
    storagePath?: string | null;
    isSubstitute?: boolean;
  },
) {
  await assertTaxStaff(userId);
  assertNoRawTin(input.tinLast4, "tax document");
  if (input.tinLast4 && !/^[0-9A-Za-z]{4}$/.test(input.tinLast4)) {
    fail("Only the last four digits of a taxpayer identification number may be stored.");
  }
  const { data, error } = await db()
    .from("tax_document_records")
    .insert({
      investment_profile_id: input.investmentProfileId ?? null,
      person_id: input.personId ?? null,
      subject_user_id: input.subjectUserId ?? null,
      offering_id: input.offeringId ?? null,
      form_type: input.formType,
      is_substitute: input.isSubstitute ?? false,
      classification: input.classification ?? null,
      tin_type: input.tinType ?? null,
      tin_last4: input.tinLast4 ?? null,
      tin_on_file: Boolean(input.tinLast4),
      certification_date: input.certificationDate ?? null,
      received_date: input.receivedDate ?? nowIso().slice(0, 10),
      effective_from: input.certificationDate ?? null,
      expires_on: documentExpiry(input.formType, input.certificationDate ?? null),
      validation_status: "received",
      storage_path: input.storagePath ?? null,
      uploaded_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  await recordTaxEvent({
    subjectTable: "tax_document_records",
    subjectId: data.id,
    event: "tax_document_recorded",
    toStatus: "received",
    detail: { formType: input.formType, tin: maskTin(input.tinLast4 ?? null, input.tinType ?? null) },
    actorUserId: userId,
  });
  return data;
}

export async function reviewTaxDocument(
  userId: string,
  documentId: string,
  decision: "valid" | "invalid" | "in_review",
  notes?: string,
) {
  await assertTaxStaff(userId);
  const doc = await rowOrFail("tax_document_records", documentId, "Tax document");
  const { data } = await db()
    .from("tax_document_records")
    .update({
      validation_status: decision,
      validation_notes: notes ?? null,
      reviewed_by: userId,
      reviewed_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", documentId)
    .select("*")
    .single();
  await recordTaxEvent({
    subjectTable: "tax_document_records",
    subjectId: documentId,
    event: "tax_document_reviewed",
    fromStatus: doc.validation_status,
    toStatus: decision,
    actorUserId: userId,
  });
  return data;
}

/** Missing and expired certifications, as of a date. */
export async function taxDocumentExceptions(userId: string, asOf?: string) {
  await assertTaxStaff(userId);
  const date = asOf ?? nowIso().slice(0, 10);
  const { data: docs } = await db().from("tax_document_records").select("*");
  const { data: classifications } = await db()
    .from("tax_classification_records")
    .select("*")
    .eq("status", "active");

  const byProfile = new Map<string, any[]>();
  for (const doc of (docs ?? []) as any[]) {
    const key = doc.investment_profile_id ?? doc.subject_user_id ?? doc.id;
    byProfile.set(key, [...(byProfile.get(key) ?? []), doc]);
  }

  const missing: any[] = [];
  const expired: any[] = [];
  for (const cls of (classifications ?? []) as any[]) {
    const key = cls.investment_profile_id ?? cls.subject_user_id ?? cls.id;
    const forms = expectedDocumentForms(cls.classification);
    const held = byProfile.get(key) ?? [];
    const valid = held.filter(
      (d) => documentValidityAsOf(d.validation_status, d.expires_on, date) === "valid",
    );
    if (valid.length === 0) {
      const stale = held.find(
        (d) => documentValidityAsOf(d.validation_status, d.expires_on, date) === "expired",
      );
      const entry = {
        investmentProfileId: cls.investment_profile_id,
        subjectUserId: cls.subject_user_id,
        classification: cls.classification,
        expectedForms: forms,
        documentId: stale?.id ?? null,
        expiresOn: stale?.expires_on ?? null,
      };
      if (stale) expired.push(entry);
      else missing.push(entry);
    }
  }
  return { asOf: date, missing, expired };
}

// ===================================================== book-tax adjustments

export async function saveBookTaxAdjustment(
  userId: string,
  input: {
    id?: string;
    taxYearId: string;
    itemCode: string;
    category: string;
    differenceType: "timing" | "permanent";
    bookAmountCents: number;
    adjustmentCents: number;
    explanation: string;
    accountId?: string | null;
    source?: string | null;
  },
) {
  await assertTaxStaff(userId);
  const year = await rowOrFail("tax_years", input.taxYearId, "Tax year");
  if (!input.explanation?.trim()) fail("Every book-to-tax difference needs a written explanation.");

  const payload = {
    tax_year_id: input.taxYearId,
    offering_id: year.offering_id,
    account_id: input.accountId ?? null,
    item_code: input.itemCode,
    category: input.category,
    difference_type: input.differenceType,
    book_amount_cents: input.bookAmountCents,
    adjustment_cents: input.adjustmentCents,
    tax_amount_cents: input.bookAmountCents + input.adjustmentCents,
    source: input.source ?? null,
    explanation: input.explanation,
    prepared_by: userId,
    prepared_at: nowIso(),
    updated_at: nowIso(),
  };

  if (input.id) {
    const existing = await rowOrFail("book_tax_adjustments", input.id, "Adjustment");
    if (existing.status === "approved") fail("An approved adjustment must be superseded, not edited.");
    const { data } = await db()
      .from("book_tax_adjustments")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    return data;
  }
  const { data, error } = await db()
    .from("book_tax_adjustments")
    .insert({ ...payload, status: "draft" })
    .select("*")
    .single();
  if (error) fail(error.message);
  await recordTaxEvent({
    subjectTable: "book_tax_adjustments",
    subjectId: data.id,
    taxYear: year.tax_year,
    offeringId: year.offering_id,
    event: "adjustment_recorded",
    actorUserId: userId,
  });
  return data;
}

export async function approveBookTaxAdjustment(userId: string, adjustmentId: string) {
  await assertTaxStaff(userId);
  const row = await rowOrFail("book_tax_adjustments", adjustmentId, "Adjustment");
  const segregation = segregationError(row.prepared_by, userId);
  if (segregation) fail(segregation);
  const { data } = await db()
    .from("book_tax_adjustments")
    .update({ status: "approved", approved_by: userId, approved_at: nowIso(), updated_at: nowIso() })
    .eq("id", adjustmentId)
    .select("*")
    .single();
  await recordTaxEvent({
    subjectTable: "book_tax_adjustments",
    subjectId: adjustmentId,
    event: "adjustment_approved",
    fromStatus: row.status,
    toStatus: "approved",
    actorUserId: userId,
  });
  return data;
}

export async function bookToTaxBridge(userId: string, taxYearId: string) {
  const year = await rowOrFail("tax_years", taxYearId, "Tax year");
  await assertFundTaxAccess(userId, year.offering_id);
  const { data: rows } = await db()
    .from("book_tax_adjustments")
    .select("*")
    .eq("tax_year_id", taxYearId);
  const list = ((rows ?? []) as any[]).filter((r) => r.status !== "superseded");
  const summary = bookToTaxSummary(
    list.map((r) => ({
      itemCode: r.item_code,
      bookAmountCents: num(r.book_amount_cents),
      adjustmentCents: num(r.adjustment_cents),
      differenceType: r.difference_type,
    })),
  );
  return { taxYear: year, adjustments: list, summary };
}

// ======================================================== tax allocations

/** Participants come from the finalized capital accounts, never from the browser. */
async function participantsForYear(offeringId: string, taxYear: number): Promise<Participant[]> {
  const { data: accounts } = await db()
    .from("capital_accounts")
    .select("*")
    .eq("offering_id", offeringId);
  const finalized = ((accounts ?? []) as any[]).filter((a) =>
    ["finalized", "published"].includes(a.status),
  );
  const source = finalized.length > 0 ? finalized : [];
  const total = source.reduce((s, a) => s + Math.abs(num(a.ending_balance_cents)), 0);
  if (source.length === 0 || total === 0) {
    // Fall back to admitted positions with an equal-weight share only when the
    // caller has explicitly supplied nothing; otherwise this stays empty and
    // the run raises an exception rather than inventing ownership.
    return [];
  }
  return source.map((a) => ({
    positionId: a.position_id ?? a.id,
    investorUserId: a.investor_user_id,
    investmentProfileId: a.investment_profile_id ?? null,
    share: Math.abs(num(a.ending_balance_cents)) / total,
  }));
}

export async function runTaxAllocation(
  userId: string,
  input: { taxYearId: string; methodologyCode: string; entityTotals?: Record<string, number> },
) {
  await assertTaxStaff(userId);
  const year = await rowOrFail("tax_years", input.taxYearId, "Tax year");

  const { data: adjustments } = await db()
    .from("book_tax_adjustments")
    .select("*")
    .eq("tax_year_id", input.taxYearId);
  const approved = ((adjustments ?? []) as any[]).filter((a) => a.status === "approved");

  const entityTotals: Record<string, number> =
    input.entityTotals ??
    approved.reduce((acc: Record<string, number>, row) => {
      acc[row.item_code] = (acc[row.item_code] ?? 0) + num(row.tax_amount_cents);
      return acc;
    }, {});

  const participants = await participantsForYear(year.offering_id, year.tax_year);
  const exceptions: TaxException[] = [];
  if (participants.length === 0) {
    exceptions.push({
      kind: "no_finalized_ownership",
      severity: "blocking",
      detail: "No finalized capital accounts were found for this year, so ownership is unknown.",
    });
  }

  const lines = allocateTaxItems(entityTotals, participants);
  const allocatedTotals = sumByItem(lines);
  const reconciliation = reconcileTaxAllocations(entityTotals, allocatedTotals);
  exceptions.push(...reconciliation.exceptions);

  const { data: previous } = await db()
    .from("tax_allocation_runs")
    .select("*")
    .eq("tax_year_id", input.taxYearId);
  const version = ((previous ?? []) as any[]).length + 1;

  const { data: run, error } = await db()
    .from("tax_allocation_runs")
    .insert({
      tax_year_id: input.taxYearId,
      offering_id: year.offering_id,
      tax_year: year.tax_year,
      methodology_code: input.methodologyCode,
      methodology_version: 1,
      methodology_snapshot: { code: input.methodologyCode },
      inputs_snapshot: { adjustmentIds: approved.map((a) => a.id), participants },
      entity_totals: entityTotals,
      allocated_totals: allocatedTotals,
      difference_cents: reconciliation.totalDifferenceCents,
      exceptions,
      status: "draft",
      version,
      prepared_by: userId,
      prepared_at: nowIso(),
    })
    .select("*")
    .single();
  if (error) fail(error.message);

  if (lines.length > 0) {
    await db()
      .from("tax_allocation_lines")
      .insert(
        lines.map((line) => ({
          run_id: run.id,
          offering_id: year.offering_id,
          position_id: line.positionId,
          investment_profile_id: line.investmentProfileId,
          investor_user_id: line.investorUserId,
          item_code: line.itemCode,
          k1_box: line.k1Box,
          amount_cents: line.amountCents,
          ownership_pct: line.ownershipPct,
        })),
      );
  }

  await recordTaxEvent({
    subjectTable: "tax_allocation_runs",
    subjectId: run.id,
    taxYear: year.tax_year,
    offeringId: year.offering_id,
    event: "tax_allocation_prepared",
    toStatus: "draft",
    actorUserId: userId,
  });
  return { run, lines, exceptions };
}

export async function finalizeTaxAllocation(userId: string, runId: string) {
  await assertTaxStaff(userId);
  const run = await rowOrFail("tax_allocation_runs", runId, "Tax allocation run");
  if (run.status === "finalized") return run;
  const segregation = segregationError(run.prepared_by, userId);
  if (segregation) fail(segregation);
  if (num(run.difference_cents) !== 0) {
    fail("Investor tax allocations must reconcile to the partnership totals exactly.");
  }
  if (blockingExceptions((run.exceptions ?? []) as TaxException[]).length > 0) {
    fail("This allocation run has blocking exceptions and cannot be finalized.");
  }
  const { data } = await db()
    .from("tax_allocation_runs")
    .update({
      status: "finalized",
      approved_by: userId,
      approved_at: nowIso(),
      finalized_by: userId,
      finalized_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", runId)
    .select("*")
    .single();
  await recordTaxEvent({
    subjectTable: "tax_allocation_runs",
    subjectId: runId,
    taxYear: run.tax_year,
    offeringId: run.offering_id,
    event: "tax_allocation_finalized",
    fromStatus: run.status,
    toStatus: "finalized",
    actorUserId: userId,
  });
  return data;
}

// ============================================================ 1065 engine

export async function prepare1065(userId: string, taxYearId: string) {
  await assertTaxStaff(userId);
  const year = await rowOrFail("tax_years", taxYearId, "Tax year");
  const { data: runs } = await db()
    .from("tax_allocation_runs")
    .select("*")
    .eq("tax_year_id", taxYearId)
    .eq("status", "finalized");
  const run = ((runs ?? []) as any[])[0] ?? null;
  if (!run) fail("A finalized tax allocation run is required before the 1065 can be prepared.");

  const bridge = await bookToTaxBridge(userId, taxYearId);
  const { data: existing } = await db()
    .from("partnership_returns")
    .select("*")
    .eq("tax_year_id", taxYearId);
  const version = ((existing ?? []) as any[]).length + 1;

  const { data, error } = await db()
    .from("partnership_returns")
    .insert({
      tax_year_id: taxYearId,
      offering_id: year.offering_id,
      tax_year: year.tax_year,
      form_type: "1065",
      ein_last4: year.ein_last4 ?? null,
      book_income_cents: bridge.summary.bookCents,
      adjustments_cents: bridge.summary.adjustmentCents,
      tax_income_cents: bridge.summary.taxCents,
      separately_stated: Object.entries(run.entity_totals ?? {}).map(([itemCode, amount]) => ({
        itemCode,
        k1Box: (K1_BOX as Record<string, string>)[itemCode] ?? null,
        amountCents: amount,
      })),
      allocation_run_id: run.id,
      source_manifest: {
        taxYear: year.tax_year,
        offeringId: year.offering_id,
        taxAllocationRunId: run.id,
        taxAllocationVersion: run.version,
        taxAdjustmentIds: bridge.adjustments.map((a: any) => a.id),
        preparedBy: userId,
        generatedAt: nowIso(),
      },
      exceptions: [],
      status: "prepared",
      version,
      prepared_by: userId,
      prepared_at: nowIso(),
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  await recordTaxEvent({
    subjectTable: "partnership_returns",
    subjectId: data.id,
    taxYear: year.tax_year,
    offeringId: year.offering_id,
    event: "return_1065_prepared",
    toStatus: "prepared",
    actorUserId: userId,
  });
  return data;
}

export async function transitionEntityReturn(
  userId: string,
  returnId: string,
  to: string,
  note?: string,
) {
  await assertTaxStaff(userId);
  const ret = await rowOrFail("partnership_returns", returnId, "Partnership return");
  if (!canTransitionEntityReturn(ret.status, to)) {
    fail(`A 1065 cannot move from ${ret.status} to ${to}.`);
  }
  if (to === "approved") {
    const segregation = segregationError(ret.prepared_by, userId);
    if (segregation) fail(segregation);
  }
  if (to === "transmitted" || to === "accepted" || to === "rejected") {
    fail("Filing results are recorded from a filing-status response, not set by hand.");
  }
  const patch: Record<string, unknown> = { status: to, updated_at: nowIso() };
  if (to === "review") {
    patch["reviewed_by"] = userId;
    patch["reviewed_at"] = nowIso();
  }
  if (to === "approved") {
    patch["approved_by"] = userId;
    patch["approved_at"] = nowIso();
  }
  if (to === "ready_to_file") patch["filing_status"] = "ready_to_file";
  const { data } = await db()
    .from("partnership_returns")
    .update(patch)
    .eq("id", returnId)
    .select("*")
    .single();
  await recordTaxEvent({
    subjectTable: "partnership_returns",
    subjectId: returnId,
    taxYear: ret.tax_year,
    offeringId: ret.offering_id,
    event: "return_1065_status",
    fromStatus: ret.status,
    toStatus: to,
    detail: note ? { note } : {},
    actorUserId: userId,
  });
  return data;
}

/** Generating the PDF is not filing. */
export async function generateEntityReturnDocument(userId: string, returnId: string) {
  await assertTaxStaff(userId);
  const ret = await rowOrFail("partnership_returns", returnId, "Partnership return");
  const { data } = await db()
    .from("partnership_returns")
    .update({ document_generated_at: nowIso(), updated_at: nowIso() })
    .eq("id", returnId)
    .select("*")
    .single();
  await recordTaxEvent({
    subjectTable: "partnership_returns",
    subjectId: returnId,
    event: "return_1065_document_generated",
    detail: { filingStatus: ret.filing_status, note: "A generated document is not a filed return." },
    actorUserId: userId,
  });
  return data;
}

// ============================================================= K-1 engine

export async function generateK1s(userId: string, returnId: string) {
  await assertTaxStaff(userId);
  const ret = await rowOrFail("partnership_returns", returnId, "Partnership return");
  if (!ret.allocation_run_id) fail("This return has no tax allocation run.");
  const run = await rowOrFail("tax_allocation_runs", ret.allocation_run_id, "Tax allocation run");
  if (run.status !== "finalized") {
    fail("K-1s can only be generated from a finalized tax allocation run.");
  }

  const { data: lineRows } = await db()
    .from("tax_allocation_lines")
    .select("*")
    .eq("run_id", run.id);
  const lines = (lineRows ?? []) as any[];

  const { data: existingRows } = await db()
    .from("k1_forms")
    .select("*")
    .eq("tax_year_id", ret.tax_year_id);
  const existing = (existingRows ?? []) as any[];

  const byRecipient = new Map<string, any[]>();
  for (const line of lines) {
    const key = [line.investment_profile_id ?? "", line.investor_user_id, line.position_id ?? ""].join("|");
    byRecipient.set(key, [...(byRecipient.get(key) ?? []), line]);
  }

  const created: any[] = [];
  for (const [key, group] of byRecipient) {
    const first = group[0];
    const duplicate = existing.find(
      (k) =>
        k.investment_profile_id === first.investment_profile_id &&
        k.investor_user_id === first.investor_user_id &&
        k.tax_year === ret.tax_year &&
        !["superseded", "amended"].includes(k.status),
    );
    if (duplicate) {
      fail(
        "A K-1 already exists for this investment profile and tax year. Issue an amended K-1 instead.",
      );
    }
    const boxes: Record<string, number> = {};
    for (const line of group) {
      const box = line.k1_box ?? line.item_code;
      boxes[box] = (boxes[box] ?? 0) + num(line.amount_cents);
    }
    const { data, error } = await db()
      .from("k1_forms")
      .insert({
        return_id: returnId,
        tax_year_id: ret.tax_year_id,
        offering_id: ret.offering_id,
        tax_year: ret.tax_year,
        position_id: first.position_id,
        investment_profile_id: first.investment_profile_id,
        investor_user_id: first.investor_user_id,
        boxes,
        outside_basis_available: false,
        source_manifest: {
          taxYear: ret.tax_year,
          offeringId: ret.offering_id,
          taxAllocationRunId: run.id,
          taxAllocationVersion: run.version,
          allocationLineIds: group.map((l) => l.id),
          preparedBy: userId,
          generatedAt: nowIso(),
        },
        status: "draft",
        version: 1,
        prepared_by: userId,
        prepared_at: nowIso(),
      })
      .select("*")
      .single();
    if (error) fail(error.message);
    created.push(data);
    void key;
  }

  // The K-1 set must add back to the partnership allocation exactly.
  const k1Totals = sumByItem(
    lines.map((l) => ({ itemCode: l.item_code, amountCents: num(l.amount_cents) })),
  );
  const reconciliation = reconcileTaxAllocations(run.entity_totals ?? {}, k1Totals);
  if (reconciliation.totalDifferenceCents !== 0) {
    fail("The K-1 set does not reconcile to the partnership tax allocation.");
  }

  await recordTaxEvent({
    subjectTable: "partnership_returns",
    subjectId: returnId,
    taxYear: ret.tax_year,
    offeringId: ret.offering_id,
    event: "k1_set_generated",
    detail: { count: created.length },
    actorUserId: userId,
  });
  return { created, reconciliation };
}

export async function transitionK1(userId: string, k1Id: string, to: string) {
  await assertTaxStaff(userId);
  const k1 = await rowOrFail("k1_forms", k1Id, "K-1");
  if (isImmutableTaxForm(k1.status) && !["superseded", "amended"].includes(to)) {
    fail("A final or delivered K-1 cannot be rewritten; issue an amended K-1.");
  }
  if (!canTransitionK1(k1.status, to)) fail(`A K-1 cannot move from ${k1.status} to ${to}.`);
  if (to === "approved") {
    const segregation = segregationError(k1.prepared_by, userId);
    if (segregation) fail(segregation);
  }
  const patch: Record<string, unknown> = { status: to, updated_at: nowIso() };
  if (to === "review") patch["reviewed_by"] = userId;
  if (to === "approved") {
    patch["approved_by"] = userId;
    patch["approved_at"] = nowIso();
  }
  if (to === "delivered") patch["delivered_at"] = nowIso();
  const { data } = await db().from("k1_forms").update(patch).eq("id", k1Id).select("*").single();
  await recordTaxEvent({
    subjectTable: "k1_forms",
    subjectId: k1Id,
    taxYear: k1.tax_year,
    offeringId: k1.offering_id,
    event: "k1_status",
    fromStatus: k1.status,
    toStatus: to,
    actorUserId: userId,
  });
  return data;
}

export async function amendK1(userId: string, k1Id: string, reason: string, boxes: Record<string, number>) {
  await assertTaxStaff(userId);
  if (!reason?.trim()) fail("An amended K-1 needs a stated reason.");
  const original = await rowOrFail("k1_forms", k1Id, "K-1");
  const { data: amended, error } = await db()
    .from("k1_forms")
    .insert({
      return_id: original.return_id,
      tax_year_id: original.tax_year_id,
      offering_id: original.offering_id,
      tax_year: original.tax_year,
      position_id: original.position_id,
      investment_profile_id: original.investment_profile_id,
      investor_user_id: original.investor_user_id,
      boxes,
      source_manifest: { ...(original.source_manifest ?? {}), amends: original.id },
      status: "draft",
      version: num(original.version) + 1,
      supersedes_id: original.id,
      amendment_reason: reason,
      prepared_by: userId,
      prepared_at: nowIso(),
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  // The original is preserved: it is marked amended, never rewritten.
  await db().from("k1_forms").update({ status: "amended" }).eq("id", k1Id);
  await recordTaxEvent({
    subjectTable: "k1_forms",
    subjectId: k1Id,
    event: "k1_amended",
    fromStatus: original.status,
    toStatus: "amended",
    detail: { reason, replacementId: amended.id },
    actorUserId: userId,
  });
  return amended;
}

// ==================================================== withholding / 1042-S

export async function recordWithholding(
  userId: string,
  input: {
    offeringId: string;
    taxYear: number;
    recipientUserId: string;
    investmentProfileId?: string | null;
    incomeCode: string;
    grossAmountCents: number;
    paymentDate: string;
    classification: string;
    treatyClaimed?: boolean;
    treatyRateBps?: number | null;
    exemptionCode?: string | null;
    sourceType?: string;
    sourceId?: string | null;
    dedupeKey?: string | null;
  },
) {
  await assertTaxStaff(userId);
  const { data: docs } = await db()
    .from("tax_document_records")
    .select("*")
    .eq("investment_profile_id", input.investmentProfileId ?? "")
;
  const document = ((docs ?? []) as any[])[0] ?? null;
  const validity = documentValidityAsOf(
    document?.validation_status ?? null,
    document?.expires_on ?? null,
    input.paymentDate,
  );
  const decision = withholdingDecision({
    classification: input.classification,
    documentValidity: validity,
    documentForm: document?.form_type ?? null,
    ...(input.treatyClaimed === undefined ? {} : { treatyClaimed: input.treatyClaimed }),
    treatyRateBps: input.treatyRateBps ?? null,
    exemptionCode: input.exemptionCode ?? null,
  });
  const withheld = withheldCents(input.grossAmountCents, decision.rateBps);

  const { data, error } = await db()
    .from("withholding_records")
    .insert({
      offering_id: input.offeringId,
      tax_year: input.taxYear,
      recipient_user_id: input.recipientUserId,
      investment_profile_id: input.investmentProfileId ?? null,
      tax_document_id: document?.id ?? null,
      classification: input.classification,
      documentation_form: document?.form_type ?? null,
      documentation_status: validity,
      income_code: input.incomeCode,
      exemption_code: input.exemptionCode ?? null,
      gross_amount_cents: input.grossAmountCents,
      withholding_rate_bps: decision.rateBps,
      amount_withheld_cents: withheld,
      rate_basis: decision.basis,
      source_type: input.sourceType ?? "manual",
      source_id: input.sourceId ?? null,
      dedupe_key: input.dedupeKey ?? null,
      exceptions: decision.exceptions,
      status: decision.exceptions.length > 0 ? "review" : "recorded",
      recorded_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  await recordTaxEvent({
    subjectTable: "withholding_records",
    subjectId: data.id,
    taxYear: input.taxYear,
    offeringId: input.offeringId,
    event: "withholding_recorded",
    detail: { basis: decision.basis, reasons: decision.reasons },
    actorUserId: userId,
  });
  return { record: data, decision };
}

export async function build1042Package(
  userId: string,
  input: { offeringId: string; taxYear: number; taxYearId?: string | null },
) {
  await assertTaxStaff(userId);
  const { data: rows } = await db()
    .from("withholding_records")
    .select("*")
    .eq("offering_id", input.offeringId)
    .eq("tax_year", input.taxYear);
  const records = (rows ?? []) as any[];

  const exceptions: TaxException[] = [];
  for (const record of records) {
    for (const ex of (record.exceptions ?? []) as TaxException[]) exceptions.push(ex);
  }

  const grouped = build1042sRecords(
    records.map((r) => ({
      id: r.id,
      recipientUserId: r.recipient_user_id,
      investmentProfileId: r.investment_profile_id,
      incomeCode: r.income_code,
      chapter: r.withholding_classification === "chapter_4" ? "4" : "3",
      country: r.tax_residency_country ?? null,
      grossCents: num(r.gross_amount_cents),
      withheldCents: num(r.amount_withheld_cents),
      rateBps: num(r.withholding_rate_bps),
      exemptionCode: r.exemption_code ?? null,
    })),
  );

  const recipientTotals = grouped.reduce(
    (acc, g) => ({
      grossCents: acc.grossCents + g.grossCents,
      withheldCents: acc.withheldCents + g.withheldCents,
    }),
    { grossCents: 0, withheldCents: 0 },
  );
  const controlTotals = records.reduce(
    (acc, r) => ({
      grossCents: acc.grossCents + num(r.gross_amount_cents),
      withheldCents: acc.withheldCents + num(r.amount_withheld_cents),
    }),
    { grossCents: 0, withheldCents: 0 },
  );
  exceptions.push(...reconcile1042(recipientTotals, controlTotals));

  const created: any[] = [];
  for (const group of grouped) {
    const { data } = await db()
      .from("form_1042s_records")
      .insert({
        offering_id: input.offeringId,
        tax_year_id: input.taxYearId ?? null,
        tax_year: input.taxYear,
        recipient_user_id: group.recipientUserId,
        investment_profile_id: group.investmentProfileId,
        income_code: group.incomeCode,
        chapter: group.chapter,
        country: group.country,
        gross_income_cents: group.grossCents,
        withheld_cents: group.withheldCents,
        rate_bps: group.rateBps,
        exemption_code: group.exemptionCode,
        withholding_record_ids: group.withholdingRecordIds,
        source_manifest: {
          taxYear: input.taxYear,
          offeringId: input.offeringId,
          withholdingRecordIds: group.withholdingRecordIds,
          preparedBy: userId,
          generatedAt: nowIso(),
        },
        status: "draft",
        prepared_by: userId,
      })
      .select("*")
      .single();
    created.push(data);
  }

  const { data: control } = await db()
    .from("form_1042_returns")
    .insert({
      offering_id: input.offeringId,
      tax_year_id: input.taxYearId ?? null,
      tax_year: input.taxYear,
      control_totals: controlTotals,
      recipient_totals: recipientTotals,
      difference_cents:
        Math.abs(controlTotals.grossCents - recipientTotals.grossCents) +
        Math.abs(controlTotals.withheldCents - recipientTotals.withheldCents),
      exceptions,
      source_manifest: {
        taxYear: input.taxYear,
        offeringId: input.offeringId,
        withholdingRecordIds: records.map((r) => r.id),
        preparedBy: userId,
      },
      status: blockingExceptions(exceptions).length > 0 ? "draft" : "prepared",
      prepared_by: userId,
    })
    .select("*")
    .single();

  return { control, recipients: created, exceptions };
}

// ============================================================ 1099 engine

export async function recordPayeePayment(
  userId: string,
  input: {
    offeringId?: string | null;
    taxYear: number;
    payeeName: string;
    payeeUserId?: string | null;
    payeeProfileId?: string | null;
    paymentType: string;
    grossAmountCents: number;
    paidOn?: string | null;
    sourceType: string;
    sourceId?: string | null;
    dedupeKey: string;
    filingResponsibility?: string;
    payeeClassification?: string | null;
  },
) {
  await assertTaxStaff(userId);
  const { data: existing } = await db()
    .from("payee_payment_records")
    .select("*")
    .eq("dedupe_key", input.dedupeKey)
    .maybeSingle();
  if (existing) return { record: existing, duplicate: true };

  const { data, error } = await db()
    .from("payee_payment_records")
    .insert({
      offering_id: input.offeringId ?? null,
      tax_year: input.taxYear,
      payee_user_id: input.payeeUserId ?? null,
      payee_profile_id: input.payeeProfileId ?? null,
      payee_name: input.payeeName,
      payee_classification: input.payeeClassification ?? null,
      payment_type: input.paymentType,
      gross_amount_cents: input.grossAmountCents,
      paid_on: input.paidOn ?? null,
      source_type: input.sourceType,
      source_id: input.sourceId ?? null,
      dedupe_key: input.dedupeKey,
      filing_responsibility: input.filingResponsibility ?? "undetermined",
      determination_status: "identified",
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  return { record: data, duplicate: false };
}

export async function determinePayeeReporting(userId: string, paymentId: string) {
  await assertTaxStaff(userId);
  const payment = await rowOrFail("payee_payment_records", paymentId, "Payment record");
  let validity: ReturnType<typeof documentValidityAsOf> = "missing";
  if (payment.tax_document_id) {
    const doc = await rowOrFail("tax_document_records", payment.tax_document_id, "Tax document");
    validity = documentValidityAsOf(
      doc.validation_status,
      doc.expires_on,
      payment.paid_on ?? nowIso().slice(0, 10),
    );
  }
  const determination = determine1099({
    paymentType: payment.payment_type,
    grossCents: num(payment.gross_amount_cents),
    payeeClassification: payment.payee_classification,
    documentValidity: validity,
    filingResponsibility: payment.filing_responsibility,
  });
  const { data } = await db()
    .from("payee_payment_records")
    .update({
      proposed_form_type: determination.formType,
      reportable_amount_cents: determination.reportableCents,
      determination_status: determination.status,
      determination_reasons: determination.reasons,
      updated_at: nowIso(),
    })
    .eq("id", paymentId)
    .select("*")
    .single();
  return { payment: data, determination };
}

export async function generate1099(
  userId: string,
  input: { taxYear: number; formType: string; recipientUserId?: string | null; recipientProfileId?: string | null; payerName: string; paymentIds: string[] },
) {
  await assertTaxStaff(userId);
  const payments: any[] = [];
  for (const id of input.paymentIds) {
    payments.push(await rowOrFail("payee_payment_records", id, "Payment record"));
  }
  const unresolved = payments.filter((p) => p.determination_status !== "calculated");
  if (unresolved.length > 0) {
    fail("Every payment must have a completed determination before a 1099 is generated.");
  }

  const { data: formRows } = await db()
    .from("form_1099_records")
    .select("*")
    .eq("tax_year", input.taxYear);
  const forms = (formRows ?? []) as any[];
  const candidate = {
    id: "candidate",
    status: "draft",
    isCorrection: false,
    paymentRecordIds: input.paymentIds,
  };
  const duplicates = duplicateReportedPayments([
    ...forms.map((f) => ({
      id: f.id,
      status: f.status,
      isCorrection: f.is_correction,
      paymentRecordIds: (f.payment_record_ids ?? []) as string[],
    })),
    candidate,
  ]);
  if (duplicates.length > 0) {
    fail(`These payments are already reported on a final 1099: ${duplicates.join(", ")}.`);
  }

  const total = payments.reduce((s, p) => s + num(p.reportable_amount_cents), 0);
  const withheld = payments.reduce((s, p) => s + num(p.withheld_cents), 0);

  const { data, error } = await db()
    .from("form_1099_records")
    .insert({
      offering_id: payments[0]?.offering_id ?? null,
      tax_year: input.taxYear,
      form_type: input.formType,
      payer_name: input.payerName,
      recipient_user_id: input.recipientUserId ?? payments[0]?.payee_user_id ?? null,
      recipient_profile_id: input.recipientProfileId ?? payments[0]?.payee_profile_id ?? null,
      recipient_name: payments[0]?.payee_name ?? "Unknown payee",
      recipient_classification: payments[0]?.payee_classification ?? null,
      tin_on_file: Boolean(payments[0]?.tin_on_file),
      boxes: { total_cents: total },
      total_amount_cents: total,
      withheld_cents: withheld,
      payment_record_ids: input.paymentIds,
      source_manifest: {
        taxYear: input.taxYear,
        inputFormIds: input.paymentIds,
        preparedBy: userId,
        generatedAt: nowIso(),
      },
      status: "draft",
      prepared_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  await recordTaxEvent({
    subjectTable: "form_1099_records",
    subjectId: data.id,
    taxYear: input.taxYear,
    event: "form_1099_generated",
    toStatus: "draft",
    actorUserId: userId,
  });
  return data;
}

export async function transition1099(userId: string, formId: string, to: string) {
  await assertTaxStaff(userId);
  const form = await rowOrFail("form_1099_records", formId, "1099");
  if (!canTransition1099(form.status, to)) {
    fail(`A 1099 cannot move from ${form.status} to ${to}.`);
  }
  if (to === "approved") {
    const segregation = segregationError(form.prepared_by, userId);
    if (segregation) fail(segregation);
  }
  const patch: Record<string, unknown> = { status: to, updated_at: nowIso() };
  if (to === "review") patch["reviewed_by"] = userId;
  if (to === "approved") patch["approved_by"] = userId;
  if (to === "ready_to_file") patch["filing_status"] = "ready_to_file";
  if (to === "recipient_delivered") patch["delivered_at"] = nowIso();
  const { data } = await db()
    .from("form_1099_records")
    .update(patch)
    .eq("id", formId)
    .select("*")
    .single();
  await recordTaxEvent({
    subjectTable: "form_1099_records",
    subjectId: formId,
    taxYear: form.tax_year,
    event: "form_1099_status",
    fromStatus: form.status,
    toStatus: to,
    actorUserId: userId,
  });
  return data;
}

export async function correct1099(
  userId: string,
  formId: string,
  reason: string,
  boxes: Record<string, number>,
) {
  await assertTaxStaff(userId);
  if (!reason?.trim()) fail("A corrected 1099 needs a stated reason.");
  const original = await rowOrFail("form_1099_records", formId, "1099");
  const total = Number(boxes["total_cents"] ?? original.total_amount_cents);
  const { data: correction, error } = await db()
    .from("form_1099_records")
    .insert({
      offering_id: original.offering_id,
      tax_year: original.tax_year,
      form_type: original.form_type,
      payer_name: original.payer_name,
      recipient_user_id: original.recipient_user_id,
      recipient_profile_id: original.recipient_profile_id,
      recipient_name: original.recipient_name,
      boxes,
      total_amount_cents: total,
      withheld_cents: original.withheld_cents,
      payment_record_ids: original.payment_record_ids,
      source_manifest: { ...(original.source_manifest ?? {}), corrects: original.id },
      status: "draft",
      is_correction: true,
      corrects_id: original.id,
      correction_reason: reason,
      version: num(original.version) + 1,
      prepared_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  // The original stays exactly as it was reported; only its status is marked.
  await db().from("form_1099_records").update({ status: "corrected" }).eq("id", formId);
  await recordTaxEvent({
    subjectTable: "form_1099_records",
    subjectId: formId,
    event: "form_1099_corrected",
    fromStatus: original.status,
    toStatus: "corrected",
    detail: { reason, correctionId: correction.id },
    actorUserId: userId,
  });
  return correction;
}

export async function reconcile1099Year(userId: string, taxYear: number) {
  await assertTaxStaff(userId);
  const { data: formRows } = await db()
    .from("form_1099_records")
    .select("*")
    .eq("tax_year", taxYear);
  const { data: paymentRows } = await db()
    .from("payee_payment_records")
    .select("*")
    .eq("tax_year", taxYear);
  const forms = ((formRows ?? []) as any[]).filter(
    (f) => !["superseded", "corrected"].includes(f.status),
  );
  const payments = ((paymentRows ?? []) as any[]).filter(
    (p) => p.determination_status === "calculated",
  );
  const exceptions = reconcile1099Totals(
    forms.map((f) => ({
      formType: f.form_type,
      totalAmountCents: num(f.total_amount_cents),
      withheldCents: num(f.withheld_cents),
    })),
    payments.map((p) => ({
      formType: p.proposed_form_type,
      reportableCents: num(p.reportable_amount_cents),
      withheldCents: num(p.withheld_cents),
    })),
  );
  const duplicates = duplicateReportedPayments(
    forms.map((f) => ({
      id: f.id,
      status: f.status,
      isCorrection: f.is_correction,
      paymentRecordIds: (f.payment_record_ids ?? []) as string[],
    })),
  );
  return { exceptions, duplicates, forms, payments };
}

// ============================================================= workpapers

export async function saveTaxWorkpaper(
  userId: string,
  input: {
    id?: string;
    taxYearId?: string | null;
    offeringId?: string | null;
    householdId?: string | null;
    taxYear: number;
    kind: string;
    title: string;
    content?: Record<string, unknown>;
    support?: unknown[];
    exceptions?: unknown[];
  },
) {
  await assertTaxStaff(userId);
  const payload = {
    tax_year_id: input.taxYearId ?? null,
    offering_id: input.offeringId ?? null,
    household_id: input.householdId ?? null,
    tax_year: input.taxYear,
    kind: input.kind,
    title: input.title,
    content: input.content ?? {},
    support: input.support ?? [],
    exceptions: input.exceptions ?? [],
    prepared_by: userId,
    prepared_at: nowIso(),
    updated_at: nowIso(),
  };
  if (input.id) {
    const existing = await rowOrFail("tax_workpapers", input.id, "Workpaper");
    if (existing.status === "approved") fail("An approved workpaper must be superseded.");
    const { data } = await db()
      .from("tax_workpapers")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    return data;
  }
  const { data, error } = await db()
    .from("tax_workpapers")
    .insert({ ...payload, status: "draft" })
    .select("*")
    .single();
  if (error) fail(error.message);
  return data;
}

export async function transitionTaxWorkpaper(userId: string, workpaperId: string, to: string) {
  await assertTaxStaff(userId);
  const wp = await rowOrFail("tax_workpapers", workpaperId, "Workpaper");
  if (!canTransitionTaxWorkpaper(wp.status, to)) {
    fail(`A workpaper cannot move from ${wp.status} to ${to}.`);
  }
  if (to === "reviewed") {
    const error = workpaperSignoffError(wp.prepared_by, userId);
    if (error) fail(error);
  }
  const patch: Record<string, unknown> = { status: to, updated_at: nowIso() };
  if (to === "reviewed") {
    patch["reviewed_by"] = userId;
    patch["reviewed_at"] = nowIso();
  }
  const { data } = await db()
    .from("tax_workpapers")
    .update(patch)
    .eq("id", workpaperId)
    .select("*")
    .single();
  return data;
}

// ======================================================= provider bridge

/**
 * Provider-neutral boundary. A provider can be handed a package and can report
 * back, but never promotes a Harmonious record past review on its own, and
 * transmission is not enabled in this phase.
 */
export async function recordProviderExchange(
  userId: string,
  input: {
    provider?: string;
    direction: "outbound" | "inbound";
    operation: ProviderOperation;
    subjectTable: string;
    subjectId: string;
    payload?: Record<string, unknown>;
    providerReference?: string | null;
    providerStatus?: string | null;
  },
) {
  await assertTaxStaff(userId);
  if (input.operation === "sendToTaxProvider" && input.direction === "outbound") {
    // Handing a package to a provider is not transmission to a tax authority.
    void 0;
  }
  const { data, error } = await db()
    .from("tax_provider_exchanges")
    .insert({
      provider: input.provider ?? "none",
      direction: input.direction,
      operation: input.operation,
      subject_table: input.subjectTable,
      subject_id: input.subjectId,
      payload: input.payload ?? {},
      provider_reference: input.providerReference ?? null,
      provider_status: input.providerStatus ?? null,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);

  const resulting = statusFromProvider(input.operation, input.providerStatus ?? null);
  return { exchange: data, resultingStatus: resulting };
}

// ==================================================== operations overview

export async function taxOperationsOverview(userId: string, taxYear?: number) {
  await assertTaxStaff(userId);
  const year = taxYear ?? new Date().getUTCFullYear() - 1;

  const [years, adjustments, runs, returns, k1s, withholding, form1042s, form1099s, individual, states, workpapers] =
    await Promise.all([
      db().from("tax_years").select("*"),
      db().from("book_tax_adjustments").select("*"),
      db().from("tax_allocation_runs").select("*").eq("tax_year", year),
      db().from("partnership_returns").select("*").eq("tax_year", year),
      db().from("k1_forms").select("*").eq("tax_year", year),
      db().from("withholding_records").select("*").eq("tax_year", year),
      db().from("form_1042s_records").select("*").eq("tax_year", year),
      db().from("form_1099_records").select("*").eq("tax_year", year),
      db().from("individual_tax_returns").select("*").eq("tax_year", year),
      db().from("state_tax_returns").select("*").eq("tax_year", year),
      db().from("tax_workpapers").select("*").eq("tax_year", year),
    ]);

  const rows = (r: any) => (r?.data ?? []) as any[];
  const documents = await taxDocumentExceptions(userId);
  const allYears = rows(years);
  const entityYears = allYears.filter((y) => y.scope === "entity");
  const individualYears = allYears.filter((y) => y.scope === "individual");

  const awaiting = (list: any[], statuses: string[]) =>
    list.filter((r) => statuses.includes(r.status));

  const allReturns = [...rows(returns), ...rows(individual)];
  return {
    taxYear: year,
    entityYears,
    individualYears,
    missingDocuments: documents.missing,
    expiredDocuments: documents.expired,
    adjustments: rows(adjustments).filter((a) => a.status !== "superseded"),
    allocationRuns: rows(runs),
    allocationReview: awaiting(rows(runs), ["draft", "review"]),
    partnershipReturns: rows(returns),
    k1Forms: rows(k1s),
    withholdingExceptions: rows(withholding).filter(
      (w) => ((w.exceptions ?? []) as unknown[]).length > 0 || w.status === "review",
    ),
    form1042s: rows(form1042s),
    form1099s: rows(form1099s),
    individualReturns: rows(individual),
    stateReturns: rows(states),
    workpapers: rows(workpapers),
    awaitingReview: awaiting(allReturns, ["review", "preparer_review", "taxpayer_review"]),
    awaitingApproval: awaiting(allReturns, ["prepared", "review"]),
    readyToFile: awaiting(allReturns, ["ready_to_file"]),
    transmitted: awaiting(allReturns, ["transmitted"]),
    accepted: awaiting(allReturns, ["accepted"]),
    rejected: awaiting(allReturns, ["rejected"]),
    delivery: [...rows(k1s), ...rows(form1042s), ...rows(form1099s)].filter((f) =>
      ["delivered", "recipient_delivered"].includes(f.status),
    ),
    amendments: [...rows(k1s), ...rows(form1099s), ...allReturns].filter((f) =>
      ["amended", "corrected", "superseded"].includes(f.status),
    ),
  };
}

/** Drill-down: fund → tax year → return → allocation → recipient → form → source. */
export async function taxYearDetail(userId: string, taxYearId: string) {
  const year = await rowOrFail("tax_years", taxYearId, "Tax year");
  const actor = await assertFundTaxAccess(userId, year.offering_id);
  const [adjustments, runs, returns, k1s, workpapers, events] = await Promise.all([
    db().from("book_tax_adjustments").select("*").eq("tax_year_id", taxYearId),
    db().from("tax_allocation_runs").select("*").eq("tax_year_id", taxYearId),
    db().from("partnership_returns").select("*").eq("tax_year_id", taxYearId),
    db().from("k1_forms").select("*").eq("tax_year_id", taxYearId),
    db().from("tax_workpapers").select("*").eq("tax_year_id", taxYearId),
    db().from("tax_events").select("*").eq("subject_id", taxYearId),
  ]);
  const rows = (r: any) => (r?.data ?? []) as any[];
  let lines: any[] = [];
  const latestRun = rows(runs)[rows(runs).length - 1];
  if (latestRun) {
    const { data } = await db().from("tax_allocation_lines").select("*").eq("run_id", latestRun.id);
    lines = (data ?? []) as any[];
  }
  return {
    taxYear: year,
    adjustments: rows(adjustments),
    allocationRuns: rows(runs),
    allocationLines: lines,
    returns: rows(returns),
    // A manager may see the fund's K-1 register, never a personal 1040.
    k1Forms: rows(k1s),
    workpapers: actor.isStaff ? rows(workpapers) : [],
    events: actor.isStaff ? rows(events) : [],
  };
}

// ====================================================== fund manager view

export async function fundTaxOverview(userId: string, offeringId: string, taxYear?: number) {
  const actor = await assertFundTaxAccess(userId, offeringId);
  const year = taxYear ?? new Date().getUTCFullYear() - 1;
  const [years, returns, k1s, withholding, form1042s, form1099s] = await Promise.all([
    db().from("tax_years").select("*").eq("offering_id", offeringId),
    db().from("partnership_returns").select("*").eq("offering_id", offeringId),
    db().from("k1_forms").select("*").eq("offering_id", offeringId),
    db().from("withholding_records").select("*").eq("offering_id", offeringId),
    db().from("form_1042s_records").select("*").eq("offering_id", offeringId),
    db().from("form_1099_records").select("*").eq("offering_id", offeringId),
  ]);
  const rows = (r: any) => (r?.data ?? []) as any[];
  const k1List = rows(k1s).filter((k) => k.tax_year === year);
  return {
    offeringId,
    taxYear: year,
    isStaff: actor.isStaff,
    years: rows(years),
    returns: rows(returns).filter((r) => r.tax_year === year),
    k1Progress: {
      total: k1List.length,
      approved: k1List.filter((k) => ["approved", "final", "delivered"].includes(k.status)).length,
      delivered: k1List.filter((k) => k.status === "delivered").length,
      amended: k1List.filter((k) => ["amended", "superseded"].includes(k.status)).length,
    },
    withholding: rows(withholding).filter((w) => w.tax_year === year),
    form1042s: rows(form1042s).filter((f) => f.tax_year === year),
    form1099s: rows(form1099s).filter((f) => f.tax_year === year),
    exceptions: rows(years)
      .filter((y) => y.tax_year === year)
      .flatMap((y) => (y.exceptions ?? []) as TaxException[]),
  };
}

/** Managers may acknowledge or challenge, and nothing else. */
export async function managerRespondToReturn(
  userId: string,
  returnId: string,
  response: "acknowledged" | "challenged",
  note?: string,
) {
  const ret = await rowOrFail("partnership_returns", returnId, "Partnership return");
  const actor = await assertFundTaxAccess(userId, ret.offering_id);
  if (actor.isStaff && !actor.isManager) {
    fail("This response is recorded by the fund manager, not by Harmonious.");
  }
  if (response === "challenged" && !note?.trim()) {
    fail("A challenge needs a written reason.");
  }
  const { data } = await db()
    .from("partnership_returns")
    .update({
      manager_response: response,
      manager_note: note ?? null,
      manager_responded_by: userId,
      manager_responded_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", returnId)
    .select("*")
    .single();
  await recordTaxEvent({
    subjectTable: "partnership_returns",
    subjectId: returnId,
    taxYear: ret.tax_year,
    offeringId: ret.offering_id,
    event: `manager_${response}`,
    detail: note ? { note } : {},
    actorUserId: userId,
  });
  return data;
}

// =================================================== investor tax documents

/**
 * Investor tax documents, grouped investment profile → fund → tax year.
 * Only forms the taxpayer is entitled to, and only once published to them.
 */
export async function investorTaxDocuments(userId: string, viewer: ViewerContext = {}) {
  const resolved = await resolveTaxViewer(userId, "investor_tax_documents", viewer);
  const subject = resolved.subjectUserId;
  const profileIds = await subjectProfileIds(subject);

  const [profiles, positions, offerings, k1s, form1042s, form1099s] = await Promise.all([
    db().from("investment_profiles").select("*").eq("owner_user_id", subject),
    db().from("investor_positions").select("*").eq("investor_user_id", subject),
    db().from("offerings").select("id, name"),
    db().from("k1_forms").select("*").eq("investor_user_id", subject),
    db().from("form_1042s_records").select("*").eq("recipient_user_id", subject),
    db().from("form_1099_records").select("*").eq("recipient_user_id", subject),
  ]);
  const rows = (r: any) => (r?.data ?? []) as any[];
  const fundName = new Map(rows(offerings).map((o) => [o.id, o.name]));

  const visible = (status: string, delivered: string[]) => delivered.includes(status);
  const k1List = rows(k1s).filter((k) => visible(k.status, ["delivered", "amended", "superseded"]));
  const s1042 = rows(form1042s).filter((f) =>
    visible(f.status, ["delivered", "amended", "superseded"]),
  );
  const s1099 = rows(form1099s).filter((f) =>
    visible(f.status, ["recipient_delivered", "corrected", "superseded"]),
  );

  const groups = new Map<string, any>();
  const push = (profileId: string | null, offeringId: string | null, taxYear: number, form: any) => {
    const key = [profileId ?? "none", offeringId ?? "none", taxYear].join("|");
    const entry = groups.get(key) ?? {
      investmentProfileId: profileId,
      profileLabel:
        rows(profiles).find((p) => p.id === profileId)?.display_label ?? "Personal",
      profileType: rows(profiles).find((p) => p.id === profileId)?.profile_type ?? null,
      offeringId,
      fundName: offeringId ? fundName.get(offeringId) ?? "Fund" : null,
      taxYear,
      forms: [] as any[],
    };
    entry.forms.push(form);
    groups.set(key, entry);
  };

  for (const k of k1List) {
    push(k.investment_profile_id, k.offering_id, k.tax_year, {
      id: k.id,
      kind: "K-1",
      status: k.status,
      version: k.version,
      amended: Boolean(k.supersedes_id) || k.status === "amended",
      supersedesId: k.supersedes_id ?? null,
      deliveredAt: k.delivered_at,
    });
  }
  for (const f of s1042) {
    push(f.investment_profile_id, f.offering_id, f.tax_year, {
      id: f.id,
      kind: "1042-S",
      status: f.status,
      version: f.version,
      amended: Boolean(f.supersedes_id) || f.status === "amended",
      supersedesId: f.supersedes_id ?? null,
      deliveredAt: f.delivered_at,
    });
  }
  for (const f of s1099) {
    push(f.recipient_profile_id, f.offering_id, f.tax_year, {
      id: f.id,
      kind: f.form_type,
      status: f.status,
      version: f.version,
      amended: f.is_correction || f.status === "corrected",
      supersedesId: f.corrects_id ?? null,
      deliveredAt: f.delivered_at,
    });
  }

  await recordTaxAccess({
    actorUserId: userId,
    onBehalfOf: resolved.onBehalf ? subject : null,
    delegationId: resolved.delegationId,
    capability: resolved.capability,
    resourceTable: "investor_tax_documents",
    action: "list",
  });

  return {
    subjectUserId: subject,
    onBehalf: resolved.onBehalf,
    profileCount: profileIds.length,
    positions: rows(positions).length,
    groups: [...groups.values()].sort(
      (a, b) => b.taxYear - a.taxYear || String(a.profileLabel).localeCompare(String(b.profileLabel)),
    ),
  };
}

/** Opening one tax form. Ownership is re-read from the stored row. */
export async function investorTaxFormDetail(
  userId: string,
  input: { table: "k1_forms" | "form_1042s_records" | "form_1099_records"; id: string },
  viewer: ViewerContext = {},
) {
  const resolved = await resolveTaxViewer(userId, "investor_tax_documents", viewer);
  const row = await rowOrFail(input.table, input.id, "Tax form");
  const owner = row.investor_user_id ?? row.recipient_user_id ?? null;
  if (owner !== resolved.subjectUserId) {
    await recordTaxAccess({
      actorUserId: userId,
      resourceTable: input.table,
      resourceId: input.id,
      action: "read",
      allowed: false,
      reason: "Form belongs to another taxpayer.",
    });
    forbid("that tax form belongs to another taxpayer.");
  }
  const delivered = ["delivered", "recipient_delivered", "amended", "corrected", "superseded"];
  const actor = await taxActor(userId);
  if (!actor.isStaff && !delivered.includes(row.status)) {
    forbid("that tax form has not been issued yet.");
  }
  await recordTaxAccess({
    actorUserId: userId,
    onBehalfOf: resolved.onBehalf ? resolved.subjectUserId : null,
    delegationId: resolved.delegationId,
    capability: resolved.capability,
    resourceTable: input.table,
    resourceId: input.id,
    action: "read",
  });
  return row;
}

export { assertFundTaxWrite };
