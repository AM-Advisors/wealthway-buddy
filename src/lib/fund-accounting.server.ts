/**
 * Fund accounting prerequisites - server. Reuses the existing journal engine
 * (draftJournalEntry / advanceJournalEntry / reverseJournalEntry: balance,
 * period lock, preparer != reviewer/approver, approver != poster) and the
 * fee engine (computeFeeRun). Nothing here moves money.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reviewerScope, assertScopeAllows } from "@/lib/reviewer-authz.server";
import { draftJournalEntry, advanceJournalEntry, reverseJournalEntry } from "@/lib/accounting.server";
import { commitmentAsOf, type CommitmentEvent } from "@/lib/allocation-model";
import { computeFeeRun, type StructuredFeeTerm } from "@/lib/economic-terms";
import {
  ALL_PURPOSES, PURPOSE_ACCOUNT_TYPE, decisionError, expenseError, expenseFingerprint, expenseLines,
  feeTermDecisionError, missingMappingMessage, postError, purchaseCashOutflow, purchaseError, purchaseLines,
  resolveLines, settlementError, signedBankCents, signedBankTxCents, bankLinkError, newAccountError, settlementLines, type ExpenseCategory, type Line, type PurchaseInput,
} from "@/lib/fund-accounting-model";

const db = () => supabaseAdmin as any;
function fail(m: string): never { throw new Error(m); }

async function authorizeFund(userId: string, offeringId: string) {
  const scope = await reviewerScope(userId);
  // Existing HIGH gap: fund accounting still requires Harmonious admin authority.
  if (!scope.isAdmin) fail("Forbidden: Harmonious fund-accounting authority required.");
  assertScopeAllows(scope, offeringId);
  const { data: book } = await db().from("ledger_books").select("id").eq("offering_id", offeringId).maybeSingle();
  if (!book) fail("This fund has no accounting book.");
  return { bookId: String(book.id) };
}

async function event(offeringId: string, table: string, id: string, action: string, actor: string, reason: string | null, payload: Record<string, unknown> = {}) {
  await db().from("fund_accounting_events").insert({ offering_id: offeringId, record_table: table, record_id: id, action, actor_user_id: actor, reason, payload });
}

async function mappingsFor(bookId: string) {
  const { data } = await db().from("fund_account_mappings").select("purpose, account_id").eq("book_id", bookId).eq("active", true);
  return ((data ?? []) as any[]).map((m) => ({ purpose: String(m.purpose), accountId: String(m.account_id) }));
}

async function draftFrom(userId: string, offeringId: string, bookId: string, lines: Line[], meta: { date: string; memo: string; source: string; table: string; id: string }) {
  const r = resolveLines(lines, await mappingsFor(bookId));
  if (!r.ok) fail(missingMappingMessage(r.missing));
  const entry = await draftJournalEntry(userId, {
    bookId, entryDate: meta.date, memo: meta.memo, source: meta.source, sourceTable: meta.table, sourceId: meta.id,
    lines: r.lines.map((l) => ({ ...l, offeringId })),
  });
  return String((entry as any).id);
}

export type BankLink = { lineId?: string | null; txId?: string | null };
const LINK_TABLES = ["fund_investment_transactions", "fund_expense_records", "fund_payable_settlements"] as const;

/** Resolve a statement line and/or bank transaction to one movement, then refuse mismatches and second links. */
async function assertBankLine(offeringId: string, link: BankLink | string | null | undefined, cashCents: number, _table: string) {
  const l: BankLink = typeof link === "string" ? { lineId: link } : link ?? {};
  let { lineId, txId } = l;
  if (!lineId && !txId) return { lineId: null, txId: null };
  let bankSigned: number | null = null;
  if (lineId) {
    const { data: line } = await db().from("bank_statement_lines").select("id, offering_id, amount_cents, direction, applied_tx_id").eq("id", lineId).maybeSingle();
    if (!line || line.offering_id !== offeringId) fail("That bank line does not belong to this fund.");
    bankSigned = signedBankCents(line);
    if (!txId && line.applied_tx_id) txId = String(line.applied_tx_id);
  }
  if (txId) {
    const { data: tx } = await db().from("bank_transactions").select("id, offering_id, amount_cents, plaid_transaction_id").eq("id", txId).maybeSingle();
    if (!tx || tx.offering_id !== offeringId) fail("That bank transaction does not belong to this fund.");
    const s = signedBankTxCents(tx);
    if (bankSigned != null && s !== bankSigned) fail("The bank line and bank transaction disagree.");
    bankSigned = s;
    const m = /^stmt:(.+)$/.exec(String(tx.plaid_transaction_id ?? ""));
    if (!lineId && m) lineId = m[1];
  }
  let linked: string | null = null;
  for (const t of LINK_TABLES) {
    for (const [col, v] of [["bank_line_id", lineId], ["bank_transaction_id", txId]] as const) {
      if (!v || linked) continue;
      const { data } = await db().from(t).select("id").eq(col, v).neq("status", "rejected").limit(1);
      if ((data ?? []).length) linked = t.replace(/^fund_/, "").replace(/_/g, " ");
    }
  }
  const err = bankLinkError({ cashCents, bankSignedCents: bankSigned!, alreadyLinkedTo: linked });
  if (err) fail(err);
  return { lineId: lineId ?? null, txId: txId ?? null };
}

/** Used by bank reconciliation: the accounting record (if any) that already carries this movement's cash. */
export async function linkedAccountingRecord(bankTransactionId: string) {
  const { data: tx } = await db().from("bank_transactions").select("plaid_transaction_id").eq("id", bankTransactionId).maybeSingle();
  const lineId = /^stmt:(.+)$/.exec(String(tx?.plaid_transaction_id ?? ""))?.[1] ?? null;
  for (const t of LINK_TABLES) {
    let q = db().from(t).select("id, status, journal_entry_id").neq("status", "rejected");
    q = lineId ? q.or(`bank_transaction_id.eq.${bankTransactionId},bank_line_id.eq.${lineId}`) : q.eq("bank_transaction_id", bankTransactionId);
    const { data } = await q.limit(1);
    const r = (data ?? [])[0];
    if (r) return { table: t, id: String(r.id), status: String(r.status), journalEntryId: r.journal_entry_id ? String(r.journal_entry_id) : null };
  }
  return null;
}

/** Add a missing expense account (no opening balance) - duplicates and non-expense types refused. */
export async function addExpenseAccount(userId: string, i: { offeringId: string; code: string; name: string; subtype: string; parentCode: string | null; reason: string }) {
  const { bookId } = await authorizeFund(userId, i.offeringId);
  if (!i.reason.trim()) fail("A reason is required.");
  const { data: accts } = await db().from("chart_of_accounts").select("id, code, name").eq("book_id", bookId);
  const existing = (accts ?? []) as any[];
  const err = newAccountError({ code: i.code, name: i.name, accountType: "expense", parentCode: i.parentCode }, existing);
  if (err) fail(err);
  const parent = i.parentCode ? existing.find((a) => a.code === i.parentCode) : null;
  if (i.parentCode && !parent) fail("Parent account not found.");
  const { data, error } = await db().from("chart_of_accounts").insert({ book_id: bookId, code: i.code, name: i.name, account_type: "expense", subtype: i.subtype, normal_balance: "debit", parent_account_id: parent?.id ?? null }).select("id").single();
  if (error) fail(error.code === "23505" ? "DUPLICATE - that account code already exists." : error.message);
  await event(i.offeringId, "chart_of_accounts", data.id, "account_added", userId, i.reason, { code: i.code, name: i.name, parentCode: i.parentCode });
  return { id: String(data.id) };
}

// ------------------------------------------------------------ mappings
export async function listMappings(userId: string, offeringId: string) {
  const { bookId } = await authorizeFund(userId, offeringId);
  const [{ data: accounts }, { data: maps }] = await Promise.all([
    db().from("chart_of_accounts").select("id, code, name, account_type").eq("book_id", bookId).order("code"),
    db().from("fund_account_mappings").select("*").eq("book_id", bookId).order("created_at", { ascending: false }),
  ]);
  return { purposes: ALL_PURPOSES, accounts: accounts ?? [], mappings: maps ?? [] };
}
export async function setMapping(userId: string, i: { offeringId: string; purpose: string; accountId: string; note: string | null }) {
  const { bookId } = await authorizeFund(userId, i.offeringId);
  if (!(ALL_PURPOSES as string[]).includes(i.purpose)) fail("Unknown mapping purpose.");
  const { data: acct } = await db().from("chart_of_accounts").select("id, account_type").eq("id", i.accountId).eq("book_id", bookId).maybeSingle();
  if (!acct) fail("That account is not in this fund's chart of accounts.");
  if (acct.account_type !== PURPOSE_ACCOUNT_TYPE[i.purpose]) fail(`This purpose needs a ${PURPOSE_ACCOUNT_TYPE[i.purpose]} account.`);
  // Retire, never overwrite: history of which account each purpose used stays readable.
  await db().from("fund_account_mappings").update({ active: false, retired_at: new Date().toISOString(), retired_by: userId }).eq("book_id", bookId).eq("purpose", i.purpose).eq("active", true);
  const { data, error } = await db().from("fund_account_mappings").insert({ book_id: bookId, purpose: i.purpose, account_id: i.accountId, note: i.note, created_by: userId }).select("id").single();
  if (error) fail(error.message);
  await event(i.offeringId, "fund_account_mappings", data.id, "mapping_set", userId, i.note, { purpose: i.purpose, accountId: i.accountId });
  return { id: String(data.id) };
}

// --------------------------------------------------------- investments
export async function prepareInvestment(userId: string, i: PurchaseInput & {
  offeringId: string; newAssetClass: string | null; instrument: string | null; quantity: number | null; unitPriceCents: number | null;
  evidenceReference: string | null; idempotencyKey: string; bankLineId: string | null;
}) {
  const { bookId } = await authorizeFund(userId, i.offeringId);
  const err = purchaseError(i);
  if (err) fail(err);
  const { data: existing } = await db().from("fund_investment_transactions").select("id, status").eq("offering_id", i.offeringId).eq("idempotency_key", i.idempotencyKey).maybeSingle();
  if (existing) return { id: String(existing.id), duplicate: true };
  if (i.assetId) {
    const { data: a } = await db().from("portfolio_assets").select("id, offering_id, status").eq("id", i.assetId).maybeSingle();
    if (!a || a.offering_id !== i.offeringId) fail("That holding does not belong to this fund.");
  } else {
    const { data: same } = await db().from("portfolio_assets").select("id").eq("offering_id", i.offeringId).ilike("issuer_name", i.newIssuerName!.trim()).ilike("asset_name", i.newAssetName!.trim()).limit(1);
    if ((same ?? []).length) fail("This security is already held - record an additional purchase instead.");
  }
  await assertBankLine(i.offeringId, i.bankLineId, purchaseCashOutflow(i.principalCents, i.transactionCostCents), "fund_investment_transactions");
  // Fail early on a missing mapping, before any record exists.
  const probe = resolveLines(purchaseLines(i.principalCents, i.transactionCostCents), await mappingsFor(bookId));
  if (!probe.ok) fail(missingMappingMessage(probe.missing));
  const { data, error } = await db().from("fund_investment_transactions").insert({
    offering_id: i.offeringId, book_id: bookId, kind: i.kind, asset_id: i.assetId, new_issuer_name: i.newIssuerName, new_asset_name: i.newAssetName,
    new_asset_class: i.newAssetClass, instrument: i.instrument, trade_date: i.tradeDate, settlement_date: i.settlementDate, quantity: i.quantity,
    unit_price_cents: i.unitPriceCents, principal_cents: i.principalCents, transaction_cost_cents: i.transactionCostCents,
    source_reference: i.sourceReference, evidence_reference: i.evidenceReference, idempotency_key: i.idempotencyKey, bank_line_id: i.bankLineId, prepared_by: userId,
  }).select("id").single();
  if (error) fail(error.code === "23505" ? "This transaction was already recorded." : error.message);
  const jid = await draftFrom(userId, i.offeringId, bookId, purchaseLines(i.principalCents, i.transactionCostCents), {
    date: i.settlementDate ?? i.tradeDate, memo: `Investment ${i.kind === "purchase" ? "purchase" : "additional purchase"} - ${i.newIssuerName ?? "existing holding"}`,
    source: "investment", table: "fund_investment_transactions", id: data.id,
  });
  await db().from("fund_investment_transactions").update({ journal_entry_id: jid }).eq("id", data.id);
  await event(i.offeringId, "fund_investment_transactions", data.id, "prepared", userId, null, { journalEntryId: jid, totalCostCents: i.principalCents + i.transactionCostCents });
  return { id: String(data.id), duplicate: false, journalEntryId: jid };
}

async function decide(table: string, userId: string, id: string, approve: boolean, reason: string | null) {
  const { data: r } = await db().from(table).select("*").eq("id", id).maybeSingle();
  if (!r) fail("Record not found.");
  await authorizeFund(userId, r.offering_id);
  const err = decisionError({ status: r.status, preparedBy: r.prepared_by }, userId);
  if (err) fail(err);
  if (!approve && !reason?.trim()) fail("A rejection needs a reason.");
  if (approve) {
    await advanceJournalEntry(userId, r.journal_entry_id, "reviewed");
    await advanceJournalEntry(userId, r.journal_entry_id, "approved");
  }
  const { data: upd } = await db().from(table).update({ status: approve ? "approved" : "rejected", decided_by: userId, decided_at: new Date().toISOString(), decision_reason: reason }).eq("id", id).eq("status", "prepared").select("id");
  if (!(upd ?? []).length) fail("This record was decided by someone else first.");
  await event(r.offering_id, table, id, approve ? "approved" : "rejected", userId, reason);
  return { ok: true };
}

async function post(table: string, userId: string, id: string) {
  const { data: r } = await db().from(table).select("*").eq("id", id).maybeSingle();
  if (!r) fail("Record not found.");
  await authorizeFund(userId, r.offering_id);
  const err = postError({ status: r.status, decidedBy: r.decided_by }, userId);
  if (err) fail(err);
  await advanceJournalEntry(userId, r.journal_entry_id, "posted");
  const { data: upd } = await db().from(table).update({ status: "posted" }).eq("id", id).eq("status", "approved").select("id");
  if (!(upd ?? []).length) fail("Already posted.");
  return r;
}

export const decideInvestment = (u: string, id: string, approve: boolean, reason: string | null) => decide("fund_investment_transactions", u, id, approve, reason);

/** Posting updates the holding's cost basis from the transaction - never set directly. */
export async function postInvestment(userId: string, id: string) {
  const r = await post("fund_investment_transactions", userId, id);
  const total = Number(r.principal_cents) + Number(r.transaction_cost_cents);
  let assetId = r.asset_id as string | null;
  if (r.kind === "purchase") {
    const { data: a, error } = await db().from("portfolio_assets").insert({
      book_id: r.book_id, offering_id: r.offering_id, issuer_name: r.new_issuer_name, asset_name: r.new_asset_name,
      asset_class: r.new_asset_class ?? "private_common", instrument: r.instrument, quantity: r.quantity, acquisition_date: r.trade_date,
      cost_basis_cents: total, created_by: userId, original_transaction_table: "fund_investment_transactions", original_transaction_id: r.id,
    }).select("id").single();
    if (error) fail(error.message);
    assetId = String(a.id);
    await db().from("fund_investment_transactions").update({ asset_id: assetId }).eq("id", id);
  } else {
    const { data: a } = await db().from("portfolio_assets").select("cost_basis_cents, quantity").eq("id", assetId).single();
    await db().from("portfolio_assets").update({
      cost_basis_cents: Number(a.cost_basis_cents) + total,
      quantity: r.quantity != null && a.quantity != null ? Number(a.quantity) + Number(r.quantity) : a.quantity,
    }).eq("id", assetId);
  }
  await event(r.offering_id, "fund_investment_transactions", id, "posted", userId, null, { assetId, totalCostCents: total });
  return { assetId };
}

/** Correction = reversal journal + cost-basis unwind; the original stays readable. */
export async function reverseInvestment(userId: string, id: string, reason: string) {
  const { data: r } = await db().from("fund_investment_transactions").select("*").eq("id", id).maybeSingle();
  if (!r) fail("Record not found.");
  await authorizeFund(userId, r.offering_id);
  if (r.status !== "posted") fail("Only a posted transaction can be reversed.");
  const rev: any = await reverseJournalEntry(userId, r.journal_entry_id, reason);
  const total = Number(r.principal_cents) + Number(r.transaction_cost_cents);
  const { data: a } = await db().from("portfolio_assets").select("cost_basis_cents").eq("id", r.asset_id).single();
  await db().from("portfolio_assets").update({ cost_basis_cents: Number(a.cost_basis_cents) - total }).eq("id", r.asset_id);
  await db().from("fund_investment_transactions").update({ status: "reversed", reversal_journal_id: rev?.id ?? rev?.reversalId ?? null, reversal_reason: reason }).eq("id", id);
  await event(r.offering_id, "fund_investment_transactions", id, "reversed", userId, reason);
  return { ok: true };
}

// ------------------------------------------------------------ expenses
export async function prepareExpense(userId: string, i: {
  offeringId: string; category: string; vendor: string; description: string; invoiceNumber: string | null; invoiceDate: string | null;
  serviceStart: string | null; serviceEnd: string | null; expenseDate: string; amountCents: number; paymentMode: "paid" | "accrued";
  paidOn: string | null; sourceReference: string; evidenceReference: string | null; bankLineId: string | null;
}) {
  const { bookId } = await authorizeFund(userId, i.offeringId);
  const err = expenseError(i);
  if (err) fail(err);
  if (i.paymentMode === "accrued" && i.bankLineId) fail("An accrued expense has no cash movement.");
  const fingerprint = expenseFingerprint(i);
  const { data: dup } = await db().from("fund_expense_records").select("id, status").eq("offering_id", i.offeringId).eq("fingerprint", fingerprint).maybeSingle();
  if (dup) fail(`DUPLICATE - REVIEW REQUIRED: this expense is already recorded (${dup.status}).`);
  if (i.paymentMode === "paid") await assertBankLine(i.offeringId, i.bankLineId, -i.amountCents, "fund_expense_records");
  const lines = expenseLines(i.category as ExpenseCategory, i.amountCents, i.paymentMode);
  const probe = resolveLines(lines, await mappingsFor(bookId));
  if (!probe.ok) fail(missingMappingMessage(probe.missing));
  const { data, error } = await db().from("fund_expense_records").insert({
    offering_id: i.offeringId, book_id: bookId, category: i.category, vendor: i.vendor, description: i.description, invoice_number: i.invoiceNumber,
    invoice_date: i.invoiceDate, service_start: i.serviceStart, service_end: i.serviceEnd, expense_date: i.expenseDate, amount_cents: i.amountCents,
    payment_mode: i.paymentMode, paid_on: i.paidOn, source_reference: i.sourceReference, evidence_reference: i.evidenceReference, fingerprint,
    bank_line_id: i.bankLineId, prepared_by: userId,
  }).select("id").single();
  if (error) fail(error.code === "23505" ? "DUPLICATE - REVIEW REQUIRED: this expense is already recorded." : error.message);
  const jid = await draftFrom(userId, i.offeringId, bookId, lines, { date: i.paidOn ?? i.expenseDate, memo: `${i.vendor} - ${i.description}`, source: "expense", table: "fund_expense_records", id: data.id });
  await db().from("fund_expense_records").update({ journal_entry_id: jid }).eq("id", data.id);
  await event(i.offeringId, "fund_expense_records", data.id, "prepared", userId, null, { journalEntryId: jid, mode: i.paymentMode });
  return { id: String(data.id), journalEntryId: jid };
}
export const decideExpense = (u: string, id: string, approve: boolean, reason: string | null) => decide("fund_expense_records", u, id, approve, reason);
export async function postExpense(userId: string, id: string) {
  const r = await post("fund_expense_records", userId, id);
  await event(r.offering_id, "fund_expense_records", id, "posted", userId, null);
  return { ok: true };
}

/** Pay an accrued expense or an opening liability. Never re-expenses anything. */
export async function prepareSettlement(userId: string, i: {
  offeringId: string; expenseId: string | null; liabilityPurpose: "accounts_payable" | "accrued_expenses"; openingLiabilityReference: string | null;
  amountCents: number; paidOn: string; sourceReference: string; idempotencyKey: string; bankLineId: string | null;
}) {
  const { bookId } = await authorizeFund(userId, i.offeringId);
  if (!i.expenseId && !i.openingLiabilityReference?.trim()) fail("Name the accrued expense or the opening liability being settled.");
  const { data: existing } = await db().from("fund_payable_settlements").select("id").eq("offering_id", i.offeringId).eq("idempotency_key", i.idempotencyKey).maybeSingle();
  if (existing) return { id: String(existing.id), duplicate: true };
  let outstanding: number;
  if (i.expenseId) {
    const { data: e } = await db().from("fund_expense_records").select("*").eq("id", i.expenseId).maybeSingle();
    if (!e || e.offering_id !== i.offeringId) fail("Expense not found in this fund.");
    if (e.payment_mode !== "accrued" || e.status !== "posted") fail("Only a posted accrued expense can be settled.");
    if (i.liabilityPurpose !== "accrued_expenses") fail("An accrued expense settles against accrued expenses.");
    const { data: prior } = await db().from("fund_payable_settlements").select("amount_cents").eq("expense_id", i.expenseId).neq("status", "rejected");
    outstanding = Number(e.amount_cents) - ((prior ?? []) as any[]).reduce((s, p) => s + Number(p.amount_cents), 0);
  } else {
    // Opening liability: the outstanding balance is the mapped liability account's posted balance.
    const maps = await mappingsFor(bookId);
    const acct = maps.find((m) => m.purpose === i.liabilityPurpose)?.accountId;
    if (!acct) fail(missingMappingMessage([i.liabilityPurpose]));
    const { data: lines } = await db().from("journal_lines").select("debit_cents, credit_cents, journal_entries!inner(status)").eq("account_id", acct).eq("journal_entries.status", "posted");
    outstanding = ((lines ?? []) as any[]).reduce((s, l) => s + Number(l.credit_cents) - Number(l.debit_cents), 0);
    const { data: pend } = await db().from("fund_payable_settlements").select("amount_cents").eq("offering_id", i.offeringId).eq("liability_purpose", i.liabilityPurpose).in("status", ["prepared", "approved"]);
    outstanding -= ((pend ?? []) as any[]).reduce((s, p) => s + Number(p.amount_cents), 0);
  }
  const err = settlementError({ amountCents: i.amountCents, outstandingCents: outstanding });
  if (err) fail(err);
  await assertBankLine(i.offeringId, i.bankLineId, -i.amountCents, "fund_payable_settlements");
  const lines = settlementLines(i.liabilityPurpose, i.amountCents);
  const probe = resolveLines(lines, await mappingsFor(bookId));
  if (!probe.ok) fail(missingMappingMessage(probe.missing));
  const { data, error } = await db().from("fund_payable_settlements").insert({
    offering_id: i.offeringId, book_id: bookId, expense_id: i.expenseId, liability_purpose: i.liabilityPurpose, opening_liability_reference: i.openingLiabilityReference,
    amount_cents: i.amountCents, paid_on: i.paidOn, source_reference: i.sourceReference, idempotency_key: i.idempotencyKey, bank_line_id: i.bankLineId, prepared_by: userId,
  }).select("id").single();
  if (error) fail(error.message);
  const jid = await draftFrom(userId, i.offeringId, bookId, lines, { date: i.paidOn, memo: `Payable settlement - ${i.sourceReference}`, source: "payment", table: "fund_payable_settlements", id: data.id });
  await db().from("fund_payable_settlements").update({ journal_entry_id: jid }).eq("id", data.id);
  await event(i.offeringId, "fund_payable_settlements", data.id, "prepared", userId, null, { journalEntryId: jid });
  return { id: String(data.id), duplicate: false, journalEntryId: jid };
}
export const decideSettlement = (u: string, id: string, approve: boolean, reason: string | null) => decide("fund_payable_settlements", u, id, approve, reason);
export async function postSettlement(userId: string, id: string) {
  const r = await post("fund_payable_settlements", userId, id);
  await event(r.offering_id, "fund_payable_settlements", id, "posted", userId, null);
  return { ok: true };
}

// ------------------------------------------------------------ fee terms
export async function prepareFeeTerm(userId: string, i: {
  offeringId: string; classId: string | null; positionId: string | null; sideLetterId: string | null; basis: string; rateBps: number;
  frequency: string; startsOn: string; endsOn: string | null; sourceDocument: string; note: string | null; supersedesTermId: string | null;
}) {
  await authorizeFund(userId, i.offeringId);
  if (!i.sourceDocument.trim()) fail("A fee term needs its contractual source.");
  if (!Number.isInteger(i.rateBps) || i.rateBps < 0 || i.rateBps > 1000) fail("Rate must be between 0 and 10%.");
  if (i.positionId && !i.sideLetterId) fail("An investor-specific fee term must reference its side letter.");
  const { data: prior } = await db().from("management_fee_terms").select("version").eq("offering_id", i.offeringId).order("version", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await db().from("management_fee_terms").insert({
    offering_id: i.offeringId, class_id: i.classId, position_id: i.positionId, side_letter_id: i.sideLetterId, basis: i.basis, rate_bps: i.rateBps,
    frequency: i.frequency, starts_on: i.startsOn, ends_on: i.endsOn, source_document: i.sourceDocument, note: i.note,
    version: prior ? Number(prior.version) + 1 : 1, approval_status: "pending", created_by: userId, prepared_by: userId, supersedes_term_id: i.supersedesTermId,
  }).select("id").single();
  if (error) fail(error.message);
  await db().from("management_fee_term_events").insert({ term_id: data.id, offering_id: i.offeringId, action: "prepared", actor_user_id: userId, payload: { rateBps: i.rateBps, basis: i.basis, source: i.sourceDocument } });
  return { id: String(data.id) };
}
export async function decideFeeTerm(userId: string, id: string, approve: boolean, reason: string) {
  const { data: t } = await db().from("management_fee_terms").select("*").eq("id", id).maybeSingle();
  if (!t) fail("Fee term not found.");
  await authorizeFund(userId, t.offering_id);
  const err = feeTermDecisionError({ approvalStatus: t.approval_status, preparedBy: t.prepared_by, createdBy: t.created_by, sourceDocument: t.source_document }, userId, approve);
  if (err) fail(err);
  if (!reason.trim()) fail("A decision needs a reason.");
  if (approve && t.side_letter_id) {
    const { data: sl } = await db().from("side_letters").select("status").eq("id", t.side_letter_id).maybeSingle();
    if (!sl || !["approved", "active", "executed"].includes(String(sl.status))) fail("The side letter itself must be approved/executed before its fee term can apply.");
  }
  const { error } = await db().from("management_fee_terms").update({ approval_status: approve ? "approved" : "rejected", approved_by: approve ? userId : null, approved_at: approve ? new Date().toISOString() : null, decision_reason: reason }).eq("id", id);
  if (error) fail(error.message);
  if (approve && t.supersedes_term_id) await db().from("management_fee_terms").update({ approval_status: "superseded", superseded_at: new Date().toISOString() }).eq("id", t.supersedes_term_id);
  await db().from("management_fee_term_events").insert({ term_id: id, offering_id: t.offering_id, action: approve ? "approved" : "rejected", actor_user_id: userId, reason });
  return { ok: true };
}

/** Read-only fee preview from approved, effective terms. Never posts anything. */
export async function feePreview(userId: string, offeringId: string, period: { start: string; end: string }) {
  await authorizeFund(userId, offeringId);
  const [{ data: terms }, { data: positions }, { data: events }] = await Promise.all([
    db().from("management_fee_terms").select("*").eq("offering_id", offeringId),
    db().from("investor_positions").select("id, display_name, class_id, status").eq("offering_id", offeringId),
    db().from("commitment_events").select("position_id, event_type, amount_cents, effective_date").eq("offering_id", offeringId),
  ]);
  const byPos = new Map<string, CommitmentEvent[]>();
  for (const e of (events ?? []) as any[]) byPos.set(String(e.position_id), [...(byPos.get(String(e.position_id)) ?? []), { eventType: e.event_type, amountCents: Number(e.amount_cents), effectiveDate: String(e.effective_date) }]);
  const structured: StructuredFeeTerm[] = ((terms ?? []) as any[]).map((r) => ({
    id: r.id, basis: r.basis, rateBps: Number(r.rate_bps), flatAmountCents: Number(r.flat_amount_cents ?? 0), frequency: r.frequency, startsOn: r.starts_on,
    endsOn: r.ends_on, stepDowns: r.step_downs ?? [], waiverBps: Number(r.waiver_bps ?? 0), offsetPct: Number(r.offset_pct ?? 0),
    classId: r.class_id, positionId: r.position_id, version: Number(r.version), approvalStatus: r.approval_status, sourceDocument: r.source_document, sideLetterId: r.side_letter_id,
  }));
  const fp = ((positions ?? []) as any[]).filter((p) => p.status === "active").map((p) => {
    const s = commitmentAsOf(byPos.get(String(p.id)) ?? [], period.end);
    return { positionId: String(p.id), classId: p.class_id ?? null, commitmentCents: s.currentCommitmentCents, contributedToDateCents: s.contributedCents, beginningCapitalCents: 0 };
  });
  const run = computeFeeRun(structured, fp, period);
  const names = new Map(((positions ?? []) as any[]).map((p) => [String(p.id), p.display_name]));
  return {
    readOnly: true, period, blocked: run.blocked, totalNetCents: run.totalNetCents,
    lines: run.lines.map((l) => ({ ...l, name: names.get(l.positionId) ?? l.positionId })),
    terms: ((terms ?? []) as any[]).map((t) => ({ id: t.id, version: t.version, classId: t.class_id, positionId: t.position_id, rateBps: t.rate_bps, basis: t.basis, startsOn: t.starts_on, endsOn: t.ends_on, status: t.approval_status, source: t.source_document, preparedBy: t.prepared_by ?? t.created_by, approvedBy: t.approved_by })),
  };
}

// ------------------------------------------------------------- overview
export async function accountingOverview(userId: string, offeringId: string) {
  const { bookId } = await authorizeFund(userId, offeringId);
  const [inv, exp, set, ev, assets] = await Promise.all([
    db().from("fund_investment_transactions").select("*").eq("offering_id", offeringId).order("created_at", { ascending: false }),
    db().from("fund_expense_records").select("*").eq("offering_id", offeringId).order("created_at", { ascending: false }),
    db().from("fund_payable_settlements").select("*").eq("offering_id", offeringId).order("created_at", { ascending: false }),
    db().from("fund_accounting_events").select("*").eq("offering_id", offeringId).order("created_at", { ascending: false }).limit(100),
    db().from("portfolio_assets").select("id, issuer_name, asset_name, cost_basis_cents, status").eq("offering_id", offeringId).order("issuer_name"),
  ]);
  const maps = await mappingsFor(bookId);
  return { investments: inv.data ?? [], expenses: exp.data ?? [], settlements: set.data ?? [], events: ev.data ?? [], assets: assets.data ?? [], mappedPurposes: maps.map((m) => m.purpose) };
}
