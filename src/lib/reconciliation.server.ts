/**
 * Server-only cash → reconciliation → general ledger pipeline.
 *
 * The bank statement stays the authoritative record of cash. Everything here
 * proposes, routes and records; nothing moves money and nothing is posted
 * without an authorised human approval at each gate:
 *
 *   bank transaction → classification → Harmonious review → manager/client
 *   approval where configured → reconciled → journal prepared → accounting
 *   approval → posted.
 *
 * Authority is always resolved server-side from user_roles and fund_managers;
 * no fund, transaction or reconciliation id from the browser is trusted.
 * One bank transaction can never produce two posted journal entries.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reviewerScope, assertScopeAllows } from "@/lib/reviewer-authz.server";
import {
  advanceJournalEntry,
  draftJournalEntry,
  ledgerBookForOffering,
  reverseJournalEntry,
} from "@/lib/accounting.server";
import {
  classifyTransaction,
  closeReadiness,
  journalShape,
  requiredApproval,
  selectPostingRule,
  type CashTransactionType,
  type Confidence,
  type ExceptionKind,
  type PostingRule,
  type Proposal,
} from "@/lib/reconciliation-model";
import type { DraftLine } from "@/lib/accounting-model";

const db = () => supabaseAdmin as any;

function fail(message: string): never {
  throw new Error(message);
}

async function assertHarmonious(userId: string) {
  const scope = await reviewerScope(userId);
  if (!scope.isAdmin) fail("Forbidden: Harmonious accounting authority required.");
  return scope;
}

async function recordEvent(entry: {
  reconciliationId: string;
  bankTransactionId?: string | null;
  actorUserId?: string | null;
  actorRole?: string;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  reason?: string | null;
  previous?: unknown;
  next?: unknown;
}) {
  await db().from("reconciliation_events").insert({
    reconciliation_id: entry.reconciliationId,
    bank_transaction_id: entry.bankTransactionId ?? null,
    actor_user_id: entry.actorUserId ?? null,
    actor_role: entry.actorRole ?? null,
    action: entry.action,
    from_status: entry.fromStatus ?? null,
    to_status: entry.toStatus ?? null,
    reason: entry.reason ?? null,
    previous_value: entry.previous ?? null,
    new_value: entry.next ?? null,
  });
}

/** Opening an exception is idempotent: the same open issue is never duplicated. */
export async function raiseException(input: {
  kind: ExceptionKind;
  offeringId?: string | null;
  bookId?: string | null;
  bankTransactionId?: string | null;
  reconciliationId?: string | null;
  journalEntryId?: string | null;
  detail?: string;
  isMaterial?: boolean;
  context?: Record<string, unknown>;
  openedBy?: string | null;
}) {
  const { error } = await db()
    .from("accounting_exceptions")
    .insert({
      kind: input.kind,
      offering_id: input.offeringId ?? null,
      book_id: input.bookId ?? null,
      bank_transaction_id: input.bankTransactionId ?? null,
      reconciliation_id: input.reconciliationId ?? null,
      journal_entry_id: input.journalEntryId ?? null,
      detail: input.detail ?? null,
      is_material: input.isMaterial ?? true,
      context: input.context ?? {},
      opened_by: input.openedBy ?? null,
    });
  // A unique-violation means the exception is already open — that is the point.
  if (error && !String(error.message).includes("duplicate key")) fail(error.message);
}

export async function resolveException(
  userId: string,
  exceptionId: string,
  status: "resolved" | "waived" | "investigating",
  note: string,
) {
  await assertHarmonious(userId);
  if (status !== "investigating" && note.trim().length < 4) {
    fail("Say why this exception is being closed.");
  }
  const { data, error } = await db()
    .from("accounting_exceptions")
    .update({
      status,
      resolution_note: note,
      resolved_by: status === "investigating" ? null : userId,
      resolved_at: status === "investigating" ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", exceptionId)
    .select("*")
    .single();
  if (error) fail(error.message);
  return data;
}

// ------------------------------------------------------------- classification

async function activeRules(offeringId: string, bookId: string | null) {
  const { data } = await db()
    .from("posting_rules")
    .select("*")
    .eq("is_active", true)
    .or(
      [
        "and(book_id.is.null,offering_id.is.null)",
        `offering_id.eq.${offeringId}`,
        bookId ? `book_id.eq.${bookId}` : "book_id.is.null",
      ].join(","),
    );
  return ((data ?? []) as PostingRule[]).filter(
    (r) => !r.book_id || r.book_id === bookId,
  );
}

async function accountIdsForRule(bookId: string, rule: PostingRule) {
  const { data } = await db()
    .from("chart_of_accounts")
    .select("id, code")
    .eq("book_id", bookId)
    .in("code", [rule.debit_account_code, rule.credit_account_code]);
  const byCode = new Map(((data ?? []) as any[]).map((a) => [a.code, a.id as string]));
  return {
    debitId: byCode.get(rule.debit_account_code) ?? null,
    creditId: byCode.get(rule.credit_account_code) ?? null,
  };
}

/**
 * Classifies every bank transaction of a fund that has no reconciliation row or
 * is still sitting at ingested/auto_matched, and writes the proposal. Re-running
 * is safe: proposals are upserted on the bank transaction, never duplicated, and
 * anything a person has already touched is left alone.
 */
export async function classifyFundCash(userId: string, offeringId: string, limit = 200) {
  const scope = await reviewerScope(userId);
  assertScopeAllows(scope, offeringId);

  const book = await ledgerBookForOffering(userId, offeringId).catch(() => null);
  const bookId = (book as any)?.id ?? null;

  const [{ data: txns }, { data: existing }, { data: applications }, { data: invoices }, { data: wires }] =
    await Promise.all([
      db()
        .from("bank_transactions")
        .select("id, offering_id, posted_on, amount_cents, name, description")
        .eq("offering_id", offeringId)
        .order("posted_on", { ascending: false })
        .limit(limit),
      db()
        .from("bank_reconciliations")
        .select("id, bank_transaction_id, status")
        .eq("offering_id", offeringId),
      db()
        .from("investor_applications")
        .select("id, user_id, commitment_cents, funding_status")
        .eq("offering_id", offeringId),
      db()
        .from("invoices")
        .select("id, number, client_id, total_cents, client_payment_reference, client_paid_on, status")
        .eq("offering_id", offeringId)
        .eq("status", "issued"),
      db()
        .from("wire_requests")
        .select("id, amount_cents, purpose, note, expected_date, status, settled_at")
        .eq("offering_id", offeringId)
        .eq("status", "approved")
        .is("settled_at", null),
    ]);

  const apps = (applications ?? []) as any[];
  const appIds = apps.map((a) => String(a.id));
  const { data: payments } = appIds.length
    ? await db()
        .from("payments")
        .select("id, application_id, amount_cents, reference_code, status")
        .in("application_id", appIds)
    : { data: [] as any[] };
  const paymentByApp = new Map(((payments ?? []) as any[]).map((p) => [String(p.application_id), p]));

  const { data: profiles } = appIds.length
    ? await db()
        .from("profiles")
        .select("id, legal_name")
        .in("id", apps.map((a) => a.user_id))
    : { data: [] as any[] };
  const nameByUser = new Map(((profiles ?? []) as any[]).map((p) => [String(p.id), p.legal_name]));

  const candidateApps = apps.map((a) => {
    const payment = paymentByApp.get(String(a.id));
    return {
      id: String(a.id),
      userId: String(a.user_id),
      commitmentCents: Number(a.commitment_cents ?? 0),
      fundingStatus: a.funding_status ?? null,
      paymentId: payment?.id ?? null,
      paymentAmountCents: payment ? Number(payment.amount_cents ?? 0) : null,
      paymentStatus: payment?.status ?? null,
      referenceCode: payment?.reference_code ?? null,
      investorName: nameByUser.get(String(a.user_id)) ?? null,
    };
  });
  const candidateInvoices = ((invoices ?? []) as any[]).map((i) => ({
    id: String(i.id),
    clientId: i.client_id ?? null,
    totalCents: Number(i.total_cents ?? 0),
    reference: i.client_payment_reference ?? null,
    declaredPaidOn: i.client_paid_on ?? null,
    number: i.number ?? null,
  }));
  const candidateWires = ((wires ?? []) as any[]).map((w) => ({
    id: String(w.id),
    amountCents: Number(w.amount_cents ?? 0),
    purpose: w.purpose ?? null,
    note: w.note ?? null,
    expectedDate: w.expected_date ?? null,
  }));

  const byTxn = new Map(((existing ?? []) as any[]).map((r) => [String(r.bank_transaction_id), r]));
  const siblings = ((txns ?? []) as any[]).map((t) => ({
    id: String(t.id),
    postedOn: String(t.posted_on),
    amountCents: Number(t.amount_cents ?? 0),
    name: t.name ?? null,
  }));
  const rules = await activeRules(offeringId, bookId);

  let classified = 0;
  let exceptions = 0;

  for (const t of (txns ?? []) as any[]) {
    const current = byTxn.get(String(t.id));
    // Anything a person has already reviewed is never re-classified underneath them.
    if (current && !["ingested", "auto_matched"].includes(String(current.status))) continue;

    const txn = {
      id: String(t.id),
      offeringId: t.offering_id ?? null,
      postedOn: String(t.posted_on),
      amountCents: Number(t.amount_cents ?? 0),
      name: t.name ?? null,
      description: t.description ?? null,
    };
    const proposal: Proposal = classifyTransaction({
      txn,
      applications: candidateApps,
      invoices: candidateInvoices,
      wireRequests: candidateWires,
      siblings,
    });

    const rule = selectPostingRule(rules, {
      transactionType: proposal.transactionType,
      inflow: txn.amountCents >= 0,
      amountCents: txn.amountCents,
      bookId,
      offeringId,
      counterparty: `${txn.name ?? ""} ${txn.description ?? ""}`,
    });
    const accounts = rule && bookId ? await accountIdsForRule(bookId, rule) : { debitId: null, creditId: null };
    if (!rule || !accounts.debitId || !accounts.creditId) {
      proposal.exceptions.push("missing_accounting_mapping");
    }

    const approval = requiredApproval({
      rule,
      amountCents: txn.amountCents,
      confidence: proposal.confidence,
    });

    const now = new Date().toISOString();
    const { data: saved, error } = await db()
      .from("bank_reconciliations")
      .upsert(
        {
          bank_transaction_id: txn.id,
          offering_id: offeringId,
          book_id: bookId,
          status: "auto_matched",
          auto_matched: true,
          transaction_type: proposal.transactionType,
          confidence: proposal.confidence,
          match_reasons: proposal.reasons,
          conflicts: proposal.conflicts,
          matched_records: proposal.matched,
          matched_application_id: proposal.matched.applicationId ?? null,
          matched_payment_id: proposal.matched.paymentId ?? null,
          matched_invoice_id: proposal.matched.invoiceId ?? null,
          matched_wire_request_id: proposal.matched.wireRequestId ?? null,
          investor_user_id: proposal.matched.investorUserId ?? null,
          investment_profile_id: proposal.matched.investmentProfileId ?? null,
          suggested_debit_account_id: accounts.debitId,
          suggested_credit_account_id: accounts.creditId,
          posting_rule_id: rule?.id ?? null,
          posting_rule_version: rule?.version ?? null,
          approval_required: approval.approver,
          classified_at: now,
          updated_at: now,
        },
        { onConflict: "bank_transaction_id" },
      )
      .select("*")
      .single();
    if (error) continue;
    classified += 1;

    await recordEvent({
      reconciliationId: saved.id,
      bankTransactionId: txn.id,
      actorUserId: userId,
      actorRole: "system",
      action: "classified automatically",
      toStatus: "auto_matched",
      next: {
        transaction_type: proposal.transactionType,
        confidence: proposal.confidence,
        reasons: proposal.reasons,
        conflicts: proposal.conflicts,
        rule: rule ? { id: rule.id, version: rule.version } : null,
        approval_required: approval.approver,
      },
    });

    for (const kind of new Set(proposal.exceptions)) {
      exceptions += 1;
      await raiseException({
        kind,
        offeringId,
        bookId,
        bankTransactionId: txn.id,
        reconciliationId: saved.id,
        detail: proposal.conflicts.join(" ") || proposal.reasons.join(" "),
        isMaterial: Math.abs(txn.amountCents) >= 25_000,
        context: { amount_cents: txn.amountCents, posted_on: txn.postedOn },
        openedBy: userId,
      });
    }
  }

  return { classified, exceptions };
}

// --------------------------------------------------------- Harmonious review

type HarmoniousAction = "approve" | "correct" | "reject" | "leave_unmatched" | "request_information";

export async function reviewReconciliation(
  userId: string,
  input: {
    reconciliationId: string;
    action: HarmoniousAction;
    reason?: string;
    correction?: {
      transactionType?: CashTransactionType;
      applicationId?: string | null;
      investorUserId?: string | null;
      investmentProfileId?: string | null;
      invoiceId?: string | null;
      wireRequestId?: string | null;
      debitAccountCode?: string;
      creditAccountCode?: string;
    };
    message?: string;
  },
) {
  await assertHarmonious(userId);
  const { data: rec } = await db()
    .from("bank_reconciliations")
    .select("*")
    .eq("id", input.reconciliationId)
    .maybeSingle();
  if (!rec) fail("That reconciliation item no longer exists.");
  if (["posted"].includes(String(rec.status))) {
    fail("This transaction is already posted. Reverse the journal to correct it.");
  }

  const now = new Date().toISOString();
  const previous = {
    status: rec.status,
    transaction_type: rec.transaction_type,
    approval_required: rec.approval_required,
  };
  const patch: Record<string, unknown> = { updated_at: now };

  if (input.action === "reject" || input.action === "leave_unmatched") {
    if (!input.reason || input.reason.trim().length < 4) {
      fail("Say why this proposed match is being set aside.");
    }
    patch['status'] = input.action === "reject" ? "rejected" : "ingested";
    patch['confidence'] = "unmatched";
    patch['transaction_type'] = null;
    patch['matched_application_id'] = null;
    patch['matched_payment_id'] = null;
    patch['matched_invoice_id'] = null;
    patch['matched_wire_request_id'] = null;
    patch['investor_user_id'] = null;
    patch['correction_reason'] = input.reason;
    patch['corrected_by'] = userId;
    patch['corrected_at'] = now;
    await raiseException({
      kind: "unmatched_cash",
      offeringId: rec.offering_id,
      bookId: rec.book_id,
      bankTransactionId: rec.bank_transaction_id,
      reconciliationId: rec.id,
      detail: input.reason,
      openedBy: userId,
    });
  } else if (input.action === "request_information") {
    if (!input.message || input.message.trim().length < 4) fail("Say what information is needed.");
    patch['status'] = "information_requested";
    patch['information_requested_at'] = now;
    patch['information_request'] = input.message;
  } else {
    // Approve, optionally after correcting the engine's proposal.
    const corrected = Boolean(input.correction);
    if (corrected && (!input.reason || input.reason.trim().length < 4)) {
      fail("A manual correction needs a reason.");
    }

    const txnType = (input.correction?.transactionType ?? rec.transaction_type) as
      | CashTransactionType
      | null;
    if (!txnType) fail("Choose what this transaction is before approving it.");

    const { data: txn } = await db()
      .from("bank_transactions")
      .select("id, amount_cents, name, description")
      .eq("id", rec.bank_transaction_id)
      .maybeSingle();
    if (!txn) fail("Bank transaction not found.");

    // A corrected investor must actually belong to this fund — an id from the
    // browser never selects the record on its own.
    let applicationId = input.correction?.applicationId ?? rec.matched_application_id;
    let investorUserId = input.correction?.investorUserId ?? rec.investor_user_id;
    if (input.correction?.applicationId) {
      const { data: app } = await db()
        .from("investor_applications")
        .select("id, user_id, offering_id")
        .eq("id", input.correction.applicationId)
        .maybeSingle();
      if (!app || app.offering_id !== rec.offering_id) {
        fail("That investor does not belong to this fund.");
      }
      applicationId = app.id;
      investorUserId = app.user_id;
    }

    const rules = await activeRules(rec.offering_id, rec.book_id);
    let rule = selectPostingRule(rules, {
      transactionType: txnType,
      inflow: Number(txn.amount_cents) >= 0,
      amountCents: Number(txn.amount_cents),
      bookId: rec.book_id,
      offeringId: rec.offering_id,
      counterparty: `${txn.name ?? ""} ${txn.description ?? ""}`,
    });
    let debitId = rec.suggested_debit_account_id;
    let creditId = rec.suggested_credit_account_id;
    if (input.correction?.debitAccountCode && input.correction?.creditAccountCode) {
      if (!rec.book_id) fail("This fund's accounting book has not been opened yet.");
      const { data: accounts } = await db()
        .from("chart_of_accounts")
        .select("id, code")
        .eq("book_id", rec.book_id)
        .in("code", [input.correction.debitAccountCode, input.correction.creditAccountCode]);
      const byCode = new Map(((accounts ?? []) as any[]).map((a) => [a.code, a.id]));
      debitId = byCode.get(input.correction.debitAccountCode) ?? null;
      creditId = byCode.get(input.correction.creditAccountCode) ?? null;
      if (!debitId || !creditId) fail("Those accounts are not in this fund's chart of accounts.");
    } else if (rule && rec.book_id) {
      const ids = await accountIdsForRule(rec.book_id, rule);
      debitId = ids.debitId;
      creditId = ids.creditId;
    } else {
      rule = rule ?? null;
    }
    if (!debitId || !creditId) {
      fail("No accounting mapping covers this transaction yet. Add a posting rule first.");
    }

    const approval = requiredApproval({
      rule,
      amountCents: Number(txn.amount_cents),
      confidence: rec.confidence as Confidence,
      manuallyCorrected: corrected,
      isClientItem: Boolean(rec.matched_invoice_id),
    });

    patch['transaction_type'] = txnType;
    patch['matched_application_id'] = applicationId ?? null;
    patch['investor_user_id'] = investorUserId ?? null;
    patch['investment_profile_id'] =
      input.correction?.investmentProfileId ?? rec.investment_profile_id ?? null;
    patch['matched_invoice_id'] = input.correction?.invoiceId ?? rec.matched_invoice_id ?? null;
    patch['matched_wire_request_id'] =
      input.correction?.wireRequestId ?? rec.matched_wire_request_id ?? null;
    patch['suggested_debit_account_id'] = debitId;
    patch['suggested_credit_account_id'] = creditId;
    patch['posting_rule_id'] = rule?.id ?? null;
    patch['posting_rule_version'] = rule?.version ?? null;
    patch['approval_required'] = approval.approver;
    patch['approved_by_harmonious'] = userId;
    patch['harmonious_approved_at'] = now;
    patch['acknowledgement_required'] = approval.approver !== "none";
    patch['status'] = approval.approver === "none" ? "reconciled" : "harmonious_reviewed";
    patch['reviewed_by'] = userId;
    patch['reviewed_at'] = now;
    if (approval.approver === "none") {
      patch['reconciled_by'] = userId;
      patch['reconciled_at'] = now;
    }
    if (corrected) {
      patch['correction_reason'] = input.reason;
      patch['corrected_by'] = userId;
      patch['corrected_at'] = now;
      patch['auto_matched'] = false;
    }
  }

  const { data: saved, error } = await db()
    .from("bank_reconciliations")
    .update(patch)
    .eq("id", rec.id)
    .neq("status", "posted")
    .select("*")
    .single();
  if (error) fail(error.message);

  await recordEvent({
    reconciliationId: rec.id,
    bankTransactionId: rec.bank_transaction_id,
    actorUserId: userId,
    actorRole: "harmonious",
    action: `harmonious ${input.action.replace(/_/g, " ")}`,
    fromStatus: String(rec.status),
    toStatus: String(saved.status),
    reason: input.reason ?? input.message ?? null,
    previous,
    next: {
      status: saved.status,
      transaction_type: saved.transaction_type,
      approval_required: saved.approval_required,
      debit_account_id: saved.suggested_debit_account_id,
      credit_account_id: saved.suggested_credit_account_id,
    },
  });

  return saved;
}

// ----------------------------------------------- fund manager / client gate

export async function externalApproveReconciliation(
  userId: string,
  input: { reconciliationId: string; decision: "approve" | "reject"; reason?: string },
) {
  const { data: rec } = await db()
    .from("bank_reconciliations")
    .select("*")
    .eq("id", input.reconciliationId)
    .maybeSingle();
  if (!rec) fail("That item no longer exists.");
  if (String(rec.status) !== "harmonious_reviewed") {
    fail("This item is not waiting for your approval.");
  }

  const scope = await reviewerScope(userId);
  if (rec.approval_required === "fund_manager") {
    // Managers only ever see and decide their own funds.
    if (!scope.isAdmin) assertScopeAllows(scope, rec.offering_id);
    if (scope.isAdmin && rec.approved_by_harmonious === userId) {
      fail("The person who approved this for Harmonious cannot also approve it for the fund.");
    }
  } else if (rec.approval_required === "client") {
    const { data: invoice } = rec.matched_invoice_id
      ? await db().from("invoices").select("client_id").eq("id", rec.matched_invoice_id).maybeSingle()
      : { data: null };
    const clientId = invoice?.client_id ?? null;
    const { data: membership } = clientId
      ? await db()
          .from("client_users")
          .select("id")
          .eq("client_id", clientId)
          .eq("user_id", userId)
          .maybeSingle()
      : { data: null };
    if (!membership) fail("This item does not belong to you.");
  } else {
    fail("This item does not need an outside approval.");
  }

  if (input.decision === "reject" && (!input.reason || input.reason.trim().length < 4)) {
    fail("Say why you are sending this back.");
  }

  const now = new Date().toISOString();
  const { data: saved, error } = await db()
    .from("bank_reconciliations")
    .update({
      status: input.decision === "approve" ? "reconciled" : "information_requested",
      external_approver_id: userId,
      external_approved_at: now,
      information_request: input.decision === "reject" ? (input.reason ?? null) : null,
      reconciled_by: input.decision === "approve" ? userId : null,
      reconciled_at: input.decision === "approve" ? now : null,
      updated_at: now,
    })
    .eq("id", rec.id)
    .eq("status", "harmonious_reviewed")
    .select("*")
    .single();
  if (error) fail("This item has already been decided.");

  await recordEvent({
    reconciliationId: rec.id,
    bankTransactionId: rec.bank_transaction_id,
    actorUserId: userId,
    actorRole: rec.approval_required,
    action: `${rec.approval_required} ${input.decision}`,
    fromStatus: "harmonious_reviewed",
    toStatus: String(saved.status),
    reason: input.reason ?? null,
  });
  return saved;
}

// ----------------------------------------------------------- journal stage

/**
 * Prepares the double-entry journal a reconciled transaction implies, using the
 * posting rule that was in force. Idempotent: the reconciliation can only ever
 * carry one journal entry.
 */
export async function prepareReconciliationJournal(userId: string, reconciliationId: string) {
  await assertHarmonious(userId);
  const { data: rec } = await db()
    .from("bank_reconciliations")
    .select("*")
    .eq("id", reconciliationId)
    .maybeSingle();
  if (!rec) fail("That reconciliation item no longer exists.");
  if (rec.journal_entry_id) return { entryId: rec.journal_entry_id as string, alreadyPrepared: true };
  if (String(rec.status) !== "reconciled") {
    fail("Only a fully approved reconciliation can become a journal.");
  }
  if (!rec.book_id) fail("This fund's accounting book has not been opened yet.");
  if (!rec.suggested_debit_account_id || !rec.suggested_credit_account_id) {
    fail("No accounting mapping is attached to this item.");
  }

  const { data: txn } = await db()
    .from("bank_transactions")
    .select("id, amount_cents, posted_on, name")
    .eq("id", rec.bank_transaction_id)
    .maybeSingle();
  if (!txn) fail("Bank transaction not found.");

  const amount = Math.abs(Number(txn.amount_cents));
  const lines: DraftLine[] = [
    {
      accountId: rec.suggested_debit_account_id,
      debitCents: amount,
      applicationId: rec.matched_application_id,
      investorUserId: rec.investor_user_id,
      investmentProfileId: rec.investment_profile_id,
    },
    {
      accountId: rec.suggested_credit_account_id,
      creditCents: amount,
      applicationId: rec.matched_application_id,
      investorUserId: rec.investor_user_id,
      investmentProfileId: rec.investment_profile_id,
    },
  ];

  let entry: any;
  try {
    entry = await draftJournalEntry(userId, {
      bookId: rec.book_id,
      entryDate: txn.posted_on,
      memo: `Bank activity: ${txn.name ?? "transaction"}`,
      source: "bank_reconciliation",
      sourceTable: "bank_transactions",
      sourceId: txn.id,
      lines,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Journal could not be prepared.";
    await raiseException({
      kind: /closed|reopen/i.test(message) ? "closed_period_transaction" : "posting_failure",
      offeringId: rec.offering_id,
      bookId: rec.book_id,
      bankTransactionId: rec.bank_transaction_id,
      reconciliationId: rec.id,
      detail: message,
      openedBy: userId,
    });
    throw e;
  }

  const { error } = await db()
    .from("bank_reconciliations")
    .update({ journal_entry_id: entry.id, updated_at: new Date().toISOString() })
    .eq("id", rec.id)
    .is("journal_entry_id", null);
  if (error) fail("A journal has already been prepared for this transaction.");

  await recordEvent({
    reconciliationId: rec.id,
    bankTransactionId: rec.bank_transaction_id,
    actorUserId: userId,
    actorRole: "harmonious",
    action: "journal prepared",
    toStatus: "reconciled",
    next: { entry_id: entry.id, rule_id: rec.posting_rule_id, rule_version: rec.posting_rule_version },
  });
  return { entryId: entry.id as string, alreadyPrepared: false };
}

/** Moves the prepared journal through accounting approval and onto the ledger. */
export async function advanceReconciliationJournal(
  userId: string,
  reconciliationId: string,
  to: "reviewed" | "approved" | "posted",
) {
  await assertHarmonious(userId);
  const { data: rec } = await db()
    .from("bank_reconciliations")
    .select("*")
    .eq("id", reconciliationId)
    .maybeSingle();
  if (!rec?.journal_entry_id) fail("No journal has been prepared for this transaction.");

  const entry = await advanceJournalEntry(userId, rec.journal_entry_id, to);

  if (to === "posted") {
    await db()
      .from("bank_reconciliations")
      .update({ status: "posted", posted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", rec.id)
      .neq("status", "posted");
  }
  await recordEvent({
    reconciliationId: rec.id,
    bankTransactionId: rec.bank_transaction_id,
    actorUserId: userId,
    actorRole: "harmonious",
    action: `journal ${to}`,
    toStatus: to === "posted" ? "posted" : String(rec.status),
    next: { entry_id: rec.journal_entry_id },
  });
  return entry;
}

/**
 * Corrects a posted mistake the only way accounting permits: reverse the entry,
 * then reclassify. The original transaction, reconciliation, journal and
 * approvals all survive untouched.
 */
export async function reverseAndCorrectReconciliation(
  userId: string,
  reconciliationId: string,
  reason: string,
) {
  await assertHarmonious(userId);
  if (reason.trim().length < 4) fail("Say why this posting is being reversed.");
  const { data: rec } = await db()
    .from("bank_reconciliations")
    .select("*")
    .eq("id", reconciliationId)
    .maybeSingle();
  if (!rec?.journal_entry_id) fail("Nothing has been posted for this transaction.");

  const reversal = await reverseJournalEntry(userId, rec.journal_entry_id, reason);

  // The corrected classification starts a fresh review; the posted history stays.
  const now = new Date().toISOString();
  await db()
    .from("bank_reconciliations")
    .update({
      status: "harmonious_reviewed",
      journal_entry_id: null,
      posted_at: null,
      correction_reason: reason,
      corrected_by: userId,
      corrected_at: now,
      updated_at: now,
    })
    .eq("id", rec.id);

  await recordEvent({
    reconciliationId: rec.id,
    bankTransactionId: rec.bank_transaction_id,
    actorUserId: userId,
    actorRole: "harmonious",
    action: "posting reversed for correction",
    fromStatus: "posted",
    toStatus: "harmonious_reviewed",
    reason,
    previous: { journal_entry_id: rec.journal_entry_id },
    next: { reversal_entry_id: (reversal as any)?.id ?? null },
  });
  return reversal;
}

// -------------------------------------------------------------- read models

export async function reconciliationQueue(
  userId: string,
  filter: { offeringId?: string; status?: string } = {},
) {
  const scope = await reviewerScope(userId);
  let query = db()
    .from("bank_reconciliations")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (filter.offeringId) {
    assertScopeAllows(scope, filter.offeringId);
    query = query.eq("offering_id", filter.offeringId);
  } else if (!scope.isAdmin) {
    query = query.in("offering_id", scope.offeringIds);
  }
  if (filter.status) query = query.eq("status", filter.status);
  const { data } = await query;
  const rows = (data ?? []) as any[];

  const txnIds = rows.map((r) => r.bank_transaction_id).filter(Boolean);
  const { data: txns } = txnIds.length
    ? await db()
        .from("bank_transactions")
        .select("id, posted_on, amount_cents, name, description")
        .in("id", txnIds)
    : { data: [] as any[] };
  const byId = new Map(((txns ?? []) as any[]).map((t) => [String(t.id), t]));

  const { data: offerings } = await db().from("offerings").select("id, name");
  const fundName = new Map(((offerings ?? []) as any[]).map((o) => [String(o.id), o.name]));

  return rows.map((r) => {
    const t = byId.get(String(r.bank_transaction_id));
    return {
      id: r.id as string,
      bankTransactionId: r.bank_transaction_id as string,
      fundId: r.offering_id as string | null,
      fundName: fundName.get(String(r.offering_id)) ?? "—",
      postedOn: t?.posted_on ?? null,
      amountCents: Number(t?.amount_cents ?? 0),
      counterparty: t?.name ?? null,
      memo: t?.description ?? null,
      status: r.status as string,
      transactionType: r.transaction_type as CashTransactionType | null,
      confidence: r.confidence as Confidence,
      reasons: (r.match_reasons ?? []) as string[],
      conflicts: (r.conflicts ?? []) as string[],
      matched: (r.matched_records ?? {}) as Record<string, string | null>,
      approvalRequired: r.approval_required as string,
      journalEntryId: r.journal_entry_id as string | null,
      correctionReason: r.correction_reason as string | null,
      informationRequest: r.information_request as string | null,
    };
  });
}

export async function reconciliationHistory(userId: string, reconciliationId: string) {
  const scope = await reviewerScope(userId);
  const { data: rec } = await db()
    .from("bank_reconciliations")
    .select("id, offering_id")
    .eq("id", reconciliationId)
    .maybeSingle();
  if (!rec) return [];
  if (!scope.isAdmin) assertScopeAllows(scope, rec.offering_id);
  const { data } = await db()
    .from("reconciliation_events")
    .select("*")
    .eq("reconciliation_id", reconciliationId)
    .order("created_at", { ascending: false });
  return (data ?? []) as any[];
}

export async function exceptionQueue(userId: string, filter: { offeringId?: string } = {}) {
  const scope = await reviewerScope(userId);
  let query = db()
    .from("accounting_exceptions")
    .select("*")
    .in("status", ["open", "investigating"])
    .order("opened_at", { ascending: false })
    .limit(200);
  if (filter.offeringId) {
    assertScopeAllows(scope, filter.offeringId);
    query = query.eq("offering_id", filter.offeringId);
  } else if (!scope.isAdmin) {
    query = query.in("offering_id", scope.offeringIds);
  }
  const { data } = await query;
  return (data ?? []) as any[];
}

/** The single Harmonious operations view over cash, reconciliation and accounting. */
export async function accountingOperations(userId: string, offeringId?: string) {
  const scope = await reviewerScope(userId);
  if (offeringId) assertScopeAllows(scope, offeringId);
  const scopeIds = scope.isAdmin ? null : scope.offeringIds;

  const today = new Date().toISOString().slice(0, 10);
  const applyScope = (q: any) => {
    if (offeringId) return q.eq("offering_id", offeringId);
    if (scopeIds) return q.in("offering_id", scopeIds);
    return q;
  };

  const [{ data: recs }, { data: txns }, { data: exceptions }, { data: entries }] = await Promise.all([
    applyScope(db().from("bank_reconciliations").select("id, status, offering_id, journal_entry_id, approval_required")),
    applyScope(db().from("bank_transactions").select("id, offering_id, amount_cents, posted_on")),
    applyScope(db().from("accounting_exceptions").select("id, status, is_material, offering_id")),
    db().from("journal_entries").select("id, status, book_id, source"),
  ]);

  const recRows = (recs ?? []) as any[];
  const txnRows = (txns ?? []) as any[];
  const exceptionRows = ((exceptions ?? []) as any[]).filter((e) =>
    ["open", "investigating"].includes(String(e.status)),
  );
  const reconciledTxnIds = new Set(
    recRows.filter((r) => ["reconciled", "posted"].includes(String(r.status))).map((r) => r.id),
  );

  const count = (predicate: (r: any) => boolean) => recRows.filter(predicate).length;
  const todays = txnRows.filter((t) => String(t.posted_on) === today);

  const unreconciled = recRows.filter(
    (r) => !["reconciled", "posted"].includes(String(r.status)),
  );

  const journalRows = ((entries ?? []) as any[]).filter((e) => e.source === "bank_reconciliation");

  return {
    cash: {
      receivedTodayCents: todays
        .filter((t) => Number(t.amount_cents) > 0)
        .reduce((s, t) => s + Number(t.amount_cents), 0),
      sentTodayCents: todays
        .filter((t) => Number(t.amount_cents) < 0)
        .reduce((s, t) => s + Math.abs(Number(t.amount_cents)), 0),
      unmatched: count((r) => String(r.confidence ?? "") === "unmatched"),
      pendingReconciliation: unreconciled.length,
    },
    reconciliation: {
      autoMatched: count((r) => String(r.status) === "auto_matched"),
      needsReview: count((r) => ["auto_matched", "ingested", "information_requested"].includes(String(r.status))),
      exceptions: exceptionRows.length,
      awaitingExternal: count((r) => String(r.status) === "harmonious_reviewed"),
    },
    accounting: {
      draftJournals: journalRows.filter((e) => e.status === "draft").length,
      awaitingApproval: journalRows.filter((e) => e.status === "reviewed").length,
      readyToPost: journalRows.filter((e) => e.status === "approved").length,
      postingExceptions: exceptionRows.filter((e) => String(e.kind ?? "") === "posting_failure").length,
    },
    close: {
      unreconciledCash: unreconciled.length,
      unpostedJournals: journalRows.filter((e) => e.status !== "posted").length,
      openExceptions: exceptionRows.length,
      reconciledCount: reconciledTxnIds.size,
    },
  };
}

/** Whether a period can safely reach its locked state. */
export async function closeReadinessForPeriod(userId: string, periodId: string) {
  const scope = await reviewerScope(userId);
  const { data: period } = await db()
    .from("accounting_periods")
    .select("id, book_id, period_start, period_end, status")
    .eq("id", periodId)
    .maybeSingle();
  if (!period) fail("Accounting period not found.");
  const { data: book } = await db()
    .from("ledger_books")
    .select("id, offering_id, close_policy")
    .eq("id", period.book_id)
    .maybeSingle();
  if (!scope.isAdmin) assertScopeAllows(scope, book?.offering_id);

  const [{ data: recs }, { data: exceptions }, { data: entries }] = await Promise.all([
    db()
      .from("bank_reconciliations")
      .select("id, status, approval_required")
      .eq("book_id", period.book_id),
    db()
      .from("accounting_exceptions")
      .select("id, status, is_material")
      .eq("book_id", period.book_id)
      .in("status", ["open", "investigating"]),
    db().from("journal_entries").select("id, status, period_id").eq("period_id", periodId),
  ]);

  const recRows = (recs ?? []) as any[];
  const unreconciled = recRows.filter((r) => !["reconciled", "posted"].includes(String(r.status)));
  const txnIds = unreconciled.map((r) => r.id);
  const { data: amounts } = txnIds.length
    ? await db().from("bank_reconciliations").select("bank_transaction_id").in("id", txnIds)
    : { data: [] as any[] };
  const bankIds = ((amounts ?? []) as any[]).map((a) => a.bank_transaction_id).filter(Boolean);
  const { data: bankRows } = bankIds.length
    ? await db().from("bank_transactions").select("amount_cents").in("id", bankIds)
    : { data: [] as any[] };
  const largest = ((bankRows ?? []) as any[]).reduce(
    (max, b) => Math.max(max, Math.abs(Number(b.amount_cents ?? 0))),
    0,
  );

  const readiness = closeReadiness(
    {
      unreconciledCash: { count: unreconciled.length, largestCents: largest },
      openExceptions: {
        count: (exceptions ?? []).length,
        materialCount: ((exceptions ?? []) as any[]).filter((e) => e.is_material).length,
      },
      awaitingApproval: recRows.filter((r) => String(r.status) === "harmonious_reviewed").length,
      unpostedJournals: ((entries ?? []) as any[]).filter((e) => e.status !== "posted").length,
    },
    (book?.close_policy ?? {}) as any,
  );
  return { period, ...readiness };
}

// ------------------------------------------------------------ posting rules

export async function listPostingRules(userId: string, offeringId?: string) {
  const scope = await reviewerScope(userId);
  if (offeringId) assertScopeAllows(scope, offeringId);
  const { data } = await db()
    .from("posting_rules")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: true });
  const rows = (data ?? []) as PostingRule[];
  if (scope.isAdmin) return rows;
  return rows.filter((r) => !r.offering_id || scope.offeringIds.includes(r.offering_id));
}

/**
 * Harmonious changes an accounting mapping without code. A change never edits
 * the rule that produced past journals: it supersedes it with a new version.
 */
export async function savePostingRule(
  userId: string,
  input: {
    supersedesId?: string | null;
    bookId?: string | null;
    offeringId?: string | null;
    name: string;
    transactionType: CashTransactionType;
    direction: "inflow" | "outflow" | "any";
    debitAccountCode: string;
    creditAccountCode: string;
    approvalRequired: "none" | "fund_manager" | "client";
    approvalThresholdCents?: number | null;
    materialityThresholdCents?: number;
    counterpartyPattern?: string | null;
    minAmountCents?: number | null;
    maxAmountCents?: number | null;
    priority?: number;
    notes?: string;
  },
) {
  await assertHarmonious(userId);
  let version = 1;
  if (input.supersedesId) {
    const { data: prior } = await db()
      .from("posting_rules")
      .select("id, version")
      .eq("id", input.supersedesId)
      .maybeSingle();
    if (!prior) fail("The rule being replaced no longer exists.");
    version = Number(prior.version ?? 1) + 1;
  }

  const { data, error } = await db()
    .from("posting_rules")
    .insert({
      book_id: input.bookId ?? null,
      offering_id: input.offeringId ?? null,
      name: input.name,
      transaction_type: input.transactionType,
      direction: input.direction,
      counterparty_pattern: input.counterpartyPattern ?? null,
      min_amount_cents: input.minAmountCents ?? null,
      max_amount_cents: input.maxAmountCents ?? null,
      debit_account_code: input.debitAccountCode,
      credit_account_code: input.creditAccountCode,
      approval_required: input.approvalRequired,
      approval_threshold_cents: input.approvalThresholdCents ?? null,
      materiality_threshold_cents: input.materialityThresholdCents ?? 0,
      priority: input.priority ?? 100,
      version,
      supersedes_id: input.supersedesId ?? null,
      notes: input.notes ?? null,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);

  if (input.supersedesId) {
    await db()
      .from("posting_rules")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", input.supersedesId);
  }
  return data;
}

export { journalShape };
