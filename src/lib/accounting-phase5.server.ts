/**
 * Phase 5 accounting: general ledger view, QuickBooks exchange, bank alerts
 * and close sheets. Server-only.
 *
 * Rules: our ledger is the only set of books; QuickBooks items only become
 * draft entries through draftJournalEntry (normal maker-checker applies);
 * outbound sends need a second person; bank alerts never change bank records;
 * close sheets are versioned and signed off by someone other than the
 * preparer. Nothing here moves money.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reviewerScope, assertScopeAllows } from "@/lib/reviewer-authz.server";
import {
  advanceJournalEntry,
  draftJournalEntry,
  openLedgerBook,
  reverseJournalEntry,
  transitionPeriod,
} from "@/lib/accounting.server";
import type { JournalStatus } from "@/lib/accounting-model";
import { trialBalance, ledgerCashCents } from "@/lib/ledger-trial-balance";
import {
  classifyInbound,
  computeDrift,
  currentMappings,
  mapKey,
  outboundDecisionAllowed,
  parseQboJournalCsv,
  parseQboTrialBalanceCsv,
  toQboJournalCsv,
} from "@/lib/qbo-sync-model";
import { alertState, canApplyAlertAction, detectAlerts, type AlertEvent, type WithdrawalFact } from "@/lib/bank-alerts";
import {
  canDecideCloseSheet,
  investorClosingTotals,
  monthBounds,
  monthEndChecklist,
  monthKey,
  type ClosingInvestor,
} from "@/lib/close-sheets";
import { isReconciledFunding } from "@/lib/funding-status";

const db = () => supabaseAdmin as any;
const fail = (m: string): never => { throw new Error(m); };

async function staff(userId: string) {
  const scope = await reviewerScope(userId).catch(() => null);
  if (!scope?.isAdmin) fail("Forbidden: Harmonious accounting staff only.");
}

async function fundName(offeringId: string) {
  const { data } = await db().from("offerings").select("id, name").eq("id", offeringId).maybeSingle();
  if (!data) fail("Fund not found.");
  return data.name as string;
}

async function bookFor(offeringId: string) {
  const { data } = await db()
    .from("ledger_books")
    .select("id, name, basis")
    .eq("offering_id", offeringId)
    .eq("domain", "fund_accounting")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1);
  return (data?.[0] ?? null) as { id: string; name: string; basis: string } | null;
}

async function ensureBook(userId: string, offeringId: string) {
  const existing = await bookFor(offeringId);
  if (existing) return existing;
  const name = await fundName(offeringId);
  const b = await openLedgerBook(userId, { name: `${name} — books`, offeringId });
  return { id: b.id, name: b.name, basis: b.basis };
}

async function names(ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter(Boolean) as string[])];
  const m = new Map<string, string>();
  if (!list.length) return m;
  const { data } = await db().from("profiles").select("id, legal_name, email").in("id", list);
  for (const p of (data ?? []) as any[]) m.set(p.id, p.legal_name || p.email || "Team member");
  return m;
}

async function postedLines(bookId: string, to?: string) {
  let q = db()
    .from("journal_lines")
    .select("account_id, debit_cents, credit_cents, journal_entries!inner(book_id, status, entry_date)")
    .eq("journal_entries.book_id", bookId)
    .eq("journal_entries.status", "posted");
  if (to) q = q.lte("journal_entries.entry_date", to);
  const { data, error } = await q.limit(20000);
  if (error) fail(error.message);
  return (data ?? []) as { account_id: string; debit_cents: number; credit_cents: number }[];
}

async function accountsFor(bookId: string) {
  const { data } = await db()
    .from("chart_of_accounts")
    .select("id, code, name, account_type, subtype, normal_balance")
    .eq("book_id", bookId)
    .eq("is_active", true);
  return (data ?? []) as any[];
}

// ------------------------------------------------------------ general ledger

export async function listAccountingFunds(userId: string) {
  await staff(userId);
  const { data } = await db().from("offerings").select("id, name").is("consolidated_into", null).order("name");
  return (data ?? []) as { id: string; name: string }[];
}

export async function ledgerView(userId: string, offeringId: string, asOf?: string) {
  await staff(userId);
  const book = await bookFor(offeringId);
  if (!book) return { book: null, accounts: [], trialBalance: null, entries: [], cashCents: 0 };
  const accounts = await accountsFor(book.id);
  const tb = trialBalance(accounts, await postedLines(book.id, asOf));
  const sub = new Map(accounts.map((a) => [a.id, a.subtype]));
  const cashCents = ledgerCashCents(tb.rows.map((r) => ({ ...r, subtype: sub.get(r.id) })));
  const { data: entries } = await db()
    .from("journal_entries")
    .select("id, entry_no, entry_date, memo, source, status, prepared_by, approved_by, posted_by, reverses_entry_id, journal_lines(account_id, debit_cents, credit_cents, memo)")
    .eq("book_id", book.id)
    .order("entry_date", { ascending: false })
    .order("entry_no", { ascending: false })
    .limit(200);
  const ppl = await names(((entries ?? []) as any[]).flatMap((e) => [e.prepared_by, e.approved_by, e.posted_by]));
  return {
    book,
    accounts,
    trialBalance: tb,
    cashCents,
    entries: ((entries ?? []) as any[]).map((e) => ({
      id: e.id,
      entryNo: e.entry_no,
      date: e.entry_date,
      memo: e.memo,
      source: e.source,
      status: e.status,
      reversesEntryId: e.reverses_entry_id,
      preparedBy: ppl.get(e.prepared_by) ?? null,
      approvedBy: e.approved_by ? ppl.get(e.approved_by) ?? null : null,
      postedBy: e.posted_by ? ppl.get(e.posted_by) ?? null : null,
      totalCents: ((e.journal_lines ?? []) as any[]).reduce((t, l) => t + Number(l.debit_cents || 0), 0),
      lines: e.journal_lines ?? [],
    })),
  };
}

export async function openBook(userId: string, offeringId: string) {
  await staff(userId);
  return ensureBook(userId, offeringId);
}

export async function draftManualEntry(
  userId: string,
  i: { offeringId: string; entryDate: string; memo: string; lines: { accountId: string; debitCents: number; creditCents: number; memo?: string | undefined }[] },
) {
  await staff(userId);
  const book = await ensureBook(userId, i.offeringId);
  return draftJournalEntry(userId, { bookId: book.id, entryDate: i.entryDate, memo: i.memo, source: "manual", lines: i.lines.map((l) => ({ ...l, memo: l.memo ?? null })) });
}

async function entryInScope(entryId: string, offeringId: string) {
  const { data } = await db().from("journal_entries").select("id, ledger_books!inner(offering_id)").eq("id", entryId).maybeSingle();
  if (!data || data.ledger_books?.offering_id !== offeringId) fail("That entry does not belong to this Fund.");
}

export async function advanceEntry(userId: string, i: { offeringId: string; entryId: string; to: JournalStatus; reason?: string | undefined }) {
  await staff(userId);
  await entryInScope(i.entryId, i.offeringId);
  return advanceJournalEntry(userId, i.entryId, i.to, i.reason);
}

export async function reverseEntry(userId: string, i: { offeringId: string; entryId: string; reason: string }) {
  await staff(userId);
  await entryInScope(i.entryId, i.offeringId);
  return reverseJournalEntry(userId, i.entryId, i.reason);
}

// ------------------------------------------------------------ QuickBooks

async function latestLink(offeringId: string) {
  const { data } = await db().from("qbo_company_links").select("*").eq("offering_id", offeringId).order("created_at", { ascending: false }).limit(1);
  const l = data?.[0];
  return l && l.status === "linked" ? l : null;
}

async function mappingsFor(offeringId: string) {
  const { data } = await db().from("qbo_account_mappings").select("qbo_account_name, account_id, created_at").eq("offering_id", offeringId);
  return currentMappings((data ?? []) as any[]);
}

export async function qboView(userId: string, offeringId: string) {
  await staff(userId);
  const book = await bookFor(offeringId);
  const [link, maps, accounts] = await Promise.all([latestLink(offeringId), mappingsFor(offeringId), book ? accountsFor(book.id) : Promise.resolve([])]);
  const [{ data: runs }, { data: inbound }, { data: batches }, { data: drift }] = await Promise.all([
    db().from("qbo_sync_runs").select("*").eq("offering_id", offeringId).order("created_at", { ascending: false }).limit(20),
    db().from("qbo_inbound_items").select("id, qbo_txn_id, txn_date, memo, total_cents, outcome, detail, journal_entry_id, created_at").eq("offering_id", offeringId).order("created_at", { ascending: false }).limit(100),
    db().from("qbo_outbound_batches").select("*, qbo_outbound_decisions(*), qbo_outbound_items(*)").eq("offering_id", offeringId).order("created_at", { ascending: false }).limit(30),
    db().from("qbo_drift_snapshots").select("*").eq("offering_id", offeringId).order("created_at", { ascending: false }).limit(10),
  ]);
  // Posted entries not yet sent or already in QuickBooks, and not ours-from-QuickBooks.
  let sendable: any[] = [];
  if (book) {
    const { data: posted } = await db().from("journal_entries").select("id, entry_no, entry_date, memo, source").eq("book_id", book.id).eq("status", "posted").neq("source", "quickbooks").order("entry_date", { ascending: false }).limit(300);
    const ids = ((posted ?? []) as any[]).map((e) => e.id);
    const { data: done } = ids.length
      ? await db().from("qbo_outbound_items").select("journal_entry_id").in("journal_entry_id", ids).in("outcome", ["sent", "already_in_qbo"])
      : { data: [] };
    const doneSet = new Set(((done ?? []) as any[]).map((d) => d.journal_entry_id));
    sendable = ((posted ?? []) as any[]).filter((e) => !doneSet.has(e.id));
  }
  const ppl = await names(((batches ?? []) as any[]).flatMap((b) => [b.created_by, b.qbo_outbound_decisions?.[0]?.decided_by ?? b.qbo_outbound_decisions?.decided_by]));
  const accountName = new Map(accounts.map((a: any) => [a.id, `${a.code} ${a.name}`]));
  return {
    link,
    liveAvailable: false,
    hasBook: Boolean(book),
    accounts: accounts.map((a: any) => ({ id: a.id, label: `${a.code} ${a.name}` })),
    mappings: [...maps.entries()].map(([k, v]) => ({ qboAccount: k, accountId: v, accountLabel: accountName.get(v) ?? "Unknown account" })),
    runs: runs ?? [],
    inbound: inbound ?? [],
    batches: ((batches ?? []) as any[]).map((b) => {
      const d = Array.isArray(b.qbo_outbound_decisions) ? b.qbo_outbound_decisions[0] : b.qbo_outbound_decisions;
      return { id: b.id, entryIds: b.entry_ids, note: b.note, createdAt: b.created_at, createdBy: ppl.get(b.created_by) ?? null, mine: b.created_by === userId, decision: d ? { decision: d.decision, reason: d.reason, by: ppl.get(d.decided_by) ?? null, at: d.created_at } : null, items: b.qbo_outbound_items ?? [] };
    }),
    drift: drift ?? [],
    sendable,
  };
}

export async function setQboLink(userId: string, i: { offeringId: string; companyName: string; realmId?: string | undefined | null | undefined; status: "linked" | "unlinked"; note?: string | undefined | null | undefined }) {
  await staff(userId);
  await fundName(i.offeringId);
  if (i.status === "linked" && !i.companyName.trim()) fail("Name the QuickBooks company.");
  const { error } = await db().from("qbo_company_links").insert({ offering_id: i.offeringId, company_name: i.companyName.trim() || "—", realm_id: i.realmId?.trim() || null, status: i.status, mode: "file", note: i.note ?? null, created_by: userId });
  if (error) fail(error.message);
  return { ok: true };
}

export async function saveQboMapping(userId: string, i: { offeringId: string; qboAccountName: string; accountId: string }) {
  await staff(userId);
  const book = await bookFor(i.offeringId);
  if (!book) fail("Open the Fund's ledger first.");
  const { data: acct } = await db().from("chart_of_accounts").select("id").eq("id", i.accountId).eq("book_id", book!.id).maybeSingle();
  if (!acct) fail("Choose an account from this Fund's chart.");
  if (!i.qboAccountName.trim()) fail("Name the QuickBooks account.");
  const { error } = await db().from("qbo_account_mappings").insert({ offering_id: i.offeringId, qbo_account_name: i.qboAccountName.trim(), account_id: i.accountId, created_by: userId });
  if (error) fail(error.message);
  return { ok: true };
}

export async function importQboJournalFile(userId: string, i: { offeringId: string; fileName: string; csv: string }) {
  await staff(userId);
  const book = await ensureBook(userId, i.offeringId);
  const parsed = parseQboJournalCsv(i.csv);
  if (parsed.error) fail(parsed.error);
  if (!parsed.txns.length) fail("No journal lines were found in that file.");
  const maps = await mappingsFor(i.offeringId);
  const { data: prior } = await db().from("qbo_inbound_items").select("qbo_txn_id").eq("offering_id", i.offeringId).eq("outcome", "drafted");
  const drafted = new Set(((prior ?? []) as any[]).map((p) => p.qbo_txn_id));
  const counts: Record<string, number> = {};
  const items: Record<string, unknown>[] = [];
  for (const t of parsed.txns) {
    const c = classifyInbound(t, maps, drafted);
    let outcome: string = c.outcome;
    let detail = c.detail ?? null;
    let entryId: string | null = null;
    const total = t.lines.reduce((s, l) => s + l.debitCents, 0);
    if (c.outcome === "drafted") {
      if (!t.date) { outcome = "unbalanced"; detail = "The entry has no date."; }
      else {
        try {
          const e = await draftJournalEntry(userId, {
            bookId: book.id,
            entryDate: t.date,
            memo: `QuickBooks ${t.id}${t.memo ? ` — ${t.memo}` : ""}`,
            source: "quickbooks",
            sourceTable: "qbo_inbound_items",
            lines: t.lines.map((l) => ({ accountId: maps.get(mapKey(l.account))!, debitCents: l.debitCents, creditCents: l.creditCents, memo: l.memo ?? null })),
          });
          entryId = e.id;
          drafted.add(t.id);
        } catch (err) {
          const msg = (err as Error).message;
          outcome = /period is closed/i.test(msg) ? "closed_period" : "unbalanced";
          detail = msg;
        }
      }
    }
    items.push({ offering_id: i.offeringId, qbo_txn_id: t.id, txn_date: t.date, memo: t.memo || null, lines: t.lines, total_cents: total, outcome, journal_entry_id: entryId, detail });
    counts[outcome] = (counts[outcome] ?? 0) + 1;
  }
  const { data: run, error: runErr } = await db().from("qbo_sync_runs").insert({ offering_id: i.offeringId, direction: "inbound", source: "file", file_name: i.fileName.slice(0, 200), counts, started_by: userId }).select("id").single();
  if (runErr) fail(runErr.message);
  for (const it of items) {
    const { error } = await db().from("qbo_inbound_items").insert({ ...it, run_id: run.id });
    if (error && !/duplicate key/i.test(error.message)) fail(error.message);
  }
  return { counts };
}

export async function createOutboundBatch(userId: string, i: { offeringId: string; entryIds: string[]; note?: string | undefined | null | undefined }) {
  await staff(userId);
  const book = await bookFor(i.offeringId);
  if (!book) fail("This Fund has no ledger yet.");
  const ids = [...new Set(i.entryIds)];
  if (!ids.length) fail("Choose at least one recorded entry.");
  const { data: rows } = await db().from("journal_entries").select("id, status, book_id, source").in("id", ids);
  const ok = ((rows ?? []) as any[]).filter((r) => r.book_id === book!.id && r.status === "posted" && r.source !== "quickbooks");
  if (ok.length !== ids.length) fail("Only this Fund's recorded entries (not ones from QuickBooks) can be sent.");
  const { data: done } = await db().from("qbo_outbound_items").select("journal_entry_id").in("journal_entry_id", ids).in("outcome", ["sent", "already_in_qbo"]);
  if ((done ?? []).length) fail("Some of those entries are already in QuickBooks.");
  const { data, error } = await db().from("qbo_outbound_batches").insert({ offering_id: i.offeringId, entry_ids: ids, note: i.note ?? null, created_by: userId }).select("id").single();
  if (error) fail(error.message);
  return data;
}

async function batchCsv(batch: any) {
  const { data: entries } = await db()
    .from("journal_entries")
    .select("id, entry_no, entry_date, memo, journal_lines(debit_cents, credit_cents, memo, chart_of_accounts(code, name))")
    .in("id", batch.entry_ids);
  const maps = await mappingsFor(batch.offering_id);
  const reverse = new Map<string, string>();
  const { data: mapRows } = await db().from("qbo_account_mappings").select("qbo_account_name, account_id, created_at").eq("offering_id", batch.offering_id).order("created_at");
  for (const m of (mapRows ?? []) as any[]) if (maps.get(mapKey(m.qbo_account_name)) === m.account_id) reverse.set(m.account_id, m.qbo_account_name);
  const { data: lineAccts } = await db().from("journal_lines").select("entry_id, account_id").in("entry_id", batch.entry_ids);
  const acctByLine = (lineAccts ?? []) as any[];
  return toQboJournalCsv(((entries ?? []) as any[]).map((e) => ({
    id: e.id,
    entryNo: e.entry_no,
    date: e.entry_date,
    memo: e.memo,
    lines: ((e.journal_lines ?? []) as any[]).map((l, idx) => {
      const accountId = acctByLine.filter((x) => x.entry_id === e.id)[idx]?.account_id;
      return { accountName: (accountId && reverse.get(accountId)) || `${l.chart_of_accounts?.code ?? ""} ${l.chart_of_accounts?.name ?? ""}`.trim(), debitCents: Number(l.debit_cents), creditCents: Number(l.credit_cents), memo: l.memo };
    }),
  })));
}

export async function decideOutboundBatch(userId: string, i: { offeringId: string; batchId: string; decision: "approved" | "declined"; reason?: string | undefined | null | undefined }) {
  await staff(userId);
  const { data: batch } = await db().from("qbo_outbound_batches").select("*").eq("id", i.batchId).eq("offering_id", i.offeringId).maybeSingle();
  if (!batch) fail("Batch not found.");
  if (!outboundDecisionAllowed(batch.created_by, userId)) fail("A batch must be approved by someone other than the person who queued it.");
  if (i.decision === "declined" && !i.reason?.trim()) fail("Say why the batch is declined.");
  const { error } = await db().from("qbo_outbound_decisions").insert({ batch_id: i.batchId, decision: i.decision, reason: i.reason ?? null, decided_by: userId });
  if (error) fail(/duplicate key/i.test(error.message) ? "This batch has already been decided." : error.message);
  if (i.decision === "approved") {
    for (const id of batch.entry_ids as string[]) {
      await db().from("qbo_outbound_items").insert({ batch_id: i.batchId, journal_entry_id: id, outcome: "exported", recorded_by: userId });
    }
    return { csv: await batchCsv(batch) };
  }
  return { csv: null };
}

export async function downloadOutboundBatch(userId: string, i: { offeringId: string; batchId: string }) {
  await staff(userId);
  const { data: batch } = await db().from("qbo_outbound_batches").select("*, qbo_outbound_decisions(decision)").eq("id", i.batchId).eq("offering_id", i.offeringId).maybeSingle();
  if (!batch) fail("Batch not found.");
  const d = Array.isArray(batch.qbo_outbound_decisions) ? batch.qbo_outbound_decisions[0] : batch.qbo_outbound_decisions;
  if (d?.decision !== "approved") fail("Only an approved batch can be downloaded.");
  return { csv: await batchCsv(batch) };
}

export async function recordOutboundResult(userId: string, i: { offeringId: string; batchId: string; entryId: string; outcome: "sent" | "failed" | "already_in_qbo"; qboTxnId?: string | undefined | null | undefined; detail?: string | undefined | null | undefined }) {
  await staff(userId);
  const { data: batch } = await db().from("qbo_outbound_batches").select("id, entry_ids, qbo_outbound_decisions(decision)").eq("id", i.batchId).eq("offering_id", i.offeringId).maybeSingle();
  if (!batch) fail("Batch not found.");
  const d = Array.isArray(batch.qbo_outbound_decisions) ? batch.qbo_outbound_decisions[0] : batch.qbo_outbound_decisions;
  if (d?.decision !== "approved") fail("Results can only be recorded for an approved batch.");
  if (!(batch.entry_ids as string[]).includes(i.entryId)) fail("That entry is not in this batch.");
  if (i.outcome === "failed" && !i.detail?.trim()) fail("Describe what failed.");
  const { error } = await db().from("qbo_outbound_items").insert({ batch_id: i.batchId, journal_entry_id: i.entryId, outcome: i.outcome, qbo_txn_id: i.qboTxnId?.trim() || null, detail: i.detail ?? null, recorded_by: userId });
  if (error) fail(/duplicate key/i.test(error.message) ? "That entry is already recorded as in QuickBooks." : error.message);
  return { ok: true };
}

export async function runDriftCheck(userId: string, i: { offeringId: string; asOf: string; csv: string; explanation?: string | undefined | null | undefined }) {
  await staff(userId);
  const book = await bookFor(i.offeringId);
  if (!book) fail("Open the Fund's ledger first.");
  const parsed = parseQboTrialBalanceCsv(i.csv);
  if (parsed.error) fail(parsed.error);
  const accounts = await accountsFor(book!.id);
  const tb = trialBalance(accounts, await postedLines(book!.id, i.asOf));
  const ledger = new Map(tb.rows.map((r) => [r.id, r.debitCents - r.creditCents]));
  const drift = computeDrift(parsed.rows, ledger, await mappingsFor(i.offeringId));
  const { error } = await db().from("qbo_drift_snapshots").insert({ offering_id: i.offeringId, as_of: i.asOf, rows: drift.rows, max_diff_cents: drift.maxDiffCents, explanation: i.explanation?.trim() || null, created_by: userId });
  if (error) fail(error.message);
  await db().from("qbo_sync_runs").insert({ offering_id: i.offeringId, direction: "drift", source: "file", counts: { accounts: drift.rows.length, maxDiffCents: drift.maxDiffCents }, started_by: userId });
  return drift;
}

export async function explainDrift(userId: string, i: { offeringId: string; snapshotId: string; explanation: string }) {
  await staff(userId);
  if (!i.explanation.trim()) fail("Write the explanation.");
  const { data: s } = await db().from("qbo_drift_snapshots").select("*").eq("id", i.snapshotId).eq("offering_id", i.offeringId).maybeSingle();
  if (!s) fail("Drift check not found.");
  const { error } = await db().from("qbo_drift_snapshots").insert({ offering_id: i.offeringId, as_of: s.as_of, rows: s.rows, max_diff_cents: s.max_diff_cents, explanation: i.explanation.trim(), created_by: userId });
  if (error) fail(error.message);
  return { ok: true };
}

// ------------------------------------------------------------ bank alerts

/** Detect and record alerts for one Fund. Safe to call repeatedly (dedupe keys). */
export async function scanBankAlerts(offeringId: string, extra?: { withdrawals?: WithdrawalFact[] }) {
  const now = new Date();
  const since = new Date(now.getTime() - 120 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: deposits }, { data: accounts }, { data: payments }, { data: balances }] = await Promise.all([
    db().from("bank_transactions").select("id, posted_on, amount_cents, name, matched_application_id, matched_invoice_id, matched_wire_request_id, direction").eq("offering_id", offeringId).gte("posted_on", since).limit(2000),
    db().from("bank_accounts").select("id, status, last_synced_at, institution_name, account_mask").eq("offering_id", offeringId),
    db().from("distribution_payments").select("submitted_amount_cents, submitted_at, status").eq("offering_id", offeringId).not("submitted_at", "is", null).limit(2000),
    db().from("bank_balance_snapshots").select("bank_account_id, as_of, balance_cents, created_at").eq("offering_id", offeringId).order("created_at", { ascending: false }).limit(50),
  ]);
  // Latest snapshot per account, all on the most recent date.
  const latest = new Map<string, any>();
  for (const b of (balances ?? []) as any[]) { const k = b.bank_account_id ?? "manual"; if (!latest.has(k)) latest.set(k, b); }
  const snaps = [...latest.values()];
  const asOf = snaps.length ? snaps.map((s) => s.as_of).sort().at(-1)! : null;
  let ledgerCash: number | null = null;
  if (asOf) {
    const book = await bookFor(offeringId);
    if (book) {
      const accts = await accountsFor(book.id);
      const tb = trialBalance(accts, await postedLines(book.id, asOf));
      const sub = new Map(accts.map((a) => [a.id, a.subtype]));
      ledgerCash = ledgerCashCents(tb.rows.map((r) => ({ ...r, subtype: sub.get(r.id) })));
    }
  }
  const found = detectAlerts({
    offeringId,
    now,
    deposits: ((deposits ?? []) as any[]).filter((d) => d.direction !== "outbound"),
    withdrawals: extra?.withdrawals ?? [],
    approvedPayments: ((payments ?? []) as any[]).filter((p) => p.status !== "failed").map((p) => ({ amountCents: Number(p.submitted_amount_cents), date: String(p.submitted_at).slice(0, 10) })),
    accounts: (accounts ?? []) as any[],
    bankBalanceCents: asOf ? snaps.filter((s) => s.as_of === asOf).reduce((t, s) => t + Number(s.balance_cents), 0) : null,
    balanceAsOf: asOf,
    ledgerCashCents: ledgerCash,
  });
  let created = 0;
  for (const a of found) {
    const { error } = await db().from("bank_alerts").insert({ offering_id: offeringId, kind: a.kind, dedupe_key: a.dedupeKey, bank_transaction_id: a.bankTransactionId ?? null, bank_account_id: a.bankAccountId ?? null, amount_cents: a.amountCents ?? null, detail: a.detail });
    if (!error) created++;
  }
  return { detected: found.length, created };
}

/** Called from the bank feed after a sync. Never throws into the feed. */
export async function recordFeedSnapshotAndScan(offeringId: string, input: { withdrawals: WithdrawalFact[]; balances: { bankAccountId: string | null; balanceCents: number }[] }) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    for (const b of input.balances) {
      await db().from("bank_balance_snapshots").insert({ offering_id: offeringId, bank_account_id: b.bankAccountId, as_of: today, balance_cents: b.balanceCents, source: "plaid" });
    }
    return await scanBankAlerts(offeringId, { withdrawals: input.withdrawals });
  } catch (err) {
    console.error("[bank-alerts] scan failed", (err as Error).message);
    return null;
  }
}

export async function scanAllFundsBankAlerts() {
  const { data } = await db().from("bank_accounts").select("offering_id");
  const ids = [...new Set(((data ?? []) as any[]).map((r) => r.offering_id).filter(Boolean))];
  let created = 0;
  for (const id of ids) {
    try { created += (await scanBankAlerts(id)).created; } catch (err) { console.error("[bank-alerts] fund scan failed", (err as Error).message); }
  }
  return { funds: ids.length, created };
}

export async function runBankAlertScan(userId: string, offeringId: string) {
  await staff(userId);
  return scanBankAlerts(offeringId);
}

export async function recordManualBalance(userId: string, i: { offeringId: string; asOf: string; balanceCents: number; bankAccountId?: string | undefined | null | undefined }) {
  await staff(userId);
  await fundName(i.offeringId);
  if (!Number.isFinite(i.balanceCents)) fail("Enter the balance.");
  const { error } = await db().from("bank_balance_snapshots").insert({ offering_id: i.offeringId, bank_account_id: i.bankAccountId ?? null, as_of: i.asOf, balance_cents: Math.round(i.balanceCents), source: "manual", recorded_by: userId });
  if (error) fail(error.message);
  return scanBankAlerts(i.offeringId);
}

export async function listBankAlerts(userId: string, i: { offeringId?: string | undefined | null | undefined; includeResolved?: boolean | undefined }) {
  await staff(userId);
  let q = db().from("bank_alerts").select("*, bank_alert_events(*), offerings(name)").order("detected_at", { ascending: false }).limit(300);
  if (i.offeringId) q = q.eq("offering_id", i.offeringId);
  const { data, error } = await q;
  if (error) fail(error.message);
  const rows = ((data ?? []) as any[]).map((a) => {
    const events = (a.bank_alert_events ?? []) as AlertEvent[];
    const s = alertState(events);
    return { id: a.id, offeringId: a.offering_id, fund: a.offerings?.name ?? "Fund", kind: a.kind, amountCents: a.amount_cents, detail: a.detail, detectedAt: a.detected_at, state: s.state, assignee: s.assignee, events: [...events].sort((x, y) => x.created_at.localeCompare(y.created_at)) };
  });
  const ppl = await names(rows.flatMap((r) => [r.assignee, ...r.events.map((e) => e.actor_user_id)]));
  return rows
    .filter((r) => i.includeResolved || r.state !== "resolved")
    .map((r) => ({ ...r, assigneeName: r.assignee ? ppl.get(r.assignee) ?? null : null, events: r.events.map((e) => ({ ...e, actor: ppl.get(e.actor_user_id) ?? null })) }));
}

export async function actOnBankAlert(userId: string, i: { alertId: string; action: AlertEvent["action"]; note?: string | undefined | null | undefined; assigneeUserId?: string | undefined | null | undefined }) {
  await staff(userId);
  const { data: a } = await db().from("bank_alerts").select("id, bank_alert_events(*)").eq("id", i.alertId).maybeSingle();
  if (!a) fail("Alert not found.");
  const state = alertState((a.bank_alert_events ?? []) as AlertEvent[]).state;
  const why = canApplyAlertAction(state, i.action, i.note);
  if (why) fail(why);
  const assignee = i.action === "assigned" ? i.assigneeUserId || userId : null;
  if (assignee && assignee !== userId) {
    const s = await reviewerScope(assignee).catch(() => null);
    if (!s?.isAdmin) fail("Alerts can only be assigned to Harmonious staff.");
  }
  const { error } = await db().from("bank_alert_events").insert({ alert_id: i.alertId, action: i.action, note: i.note ?? null, assignee_user_id: assignee, actor_user_id: userId });
  if (error) fail(error.message);
  return { ok: true };
}

// ------------------------------------------------------------ close sheets

async function investorClosingRows(offeringId: string, closingDate: string): Promise<ClosingInvestor[]> {
  const { data } = await db()
    .from("application_closings")
    .select("application_id, funded_amount_cents, investor_applications(id, user_id, commitment_cents, documents_status, funding_status)")
    .eq("offering_id", offeringId)
    .eq("closing_date", closingDate);
  const apps = ((data ?? []) as any[]).filter((r) => r.investor_applications);
  const ppl = await names(apps.map((r) => r.investor_applications.user_id));
  return apps.map((r) => {
    const a = r.investor_applications;
    const committed = Number(a.commitment_cents ?? 0);
    return {
      applicationId: a.id,
      investor: ppl.get(a.user_id) ?? "Investor",
      committedCents: committed,
      calledCents: committed,
      receivedCents: isReconciledFunding(a.funding_status) ? Number(r.funded_amount_cents ?? committed) : 0,
      signature: a.documents_status === "approved" || a.documents_status === "completed" || a.documents_status === "signed" ? "Signed" : String(a.documents_status ?? "Not started").replace(/_/g, " "),
      funding: String(a.funding_status ?? "not_started").replace(/_/g, " "),
    };
  });
}

async function monthEndFacts(offeringId: string, month: string) {
  const { start, end } = monthBounds(month);
  const book = await bookFor(offeringId);
  const [link, { data: unrec }, { data: alerts }, { data: drift }] = await Promise.all([
    latestLink(offeringId),
    db().from("bank_transactions").select("id").eq("offering_id", offeringId).lte("posted_on", end).is("matched_application_id", null).is("matched_invoice_id", null).is("matched_wire_request_id", null).limit(500),
    db().from("bank_alerts").select("id, bank_alert_events(action, created_at, actor_user_id)").eq("offering_id", offeringId).limit(500),
    db().from("qbo_drift_snapshots").select("max_diff_cents, explanation, as_of").eq("offering_id", offeringId).lte("as_of", end).order("created_at", { ascending: false }).limit(1),
  ]);
  let unposted = 0;
  let ties = true;
  if (book) {
    const { data: un } = await db().from("journal_entries").select("id").eq("book_id", book.id).in("status", ["draft", "reviewed", "approved"]).gte("entry_date", start).lte("entry_date", end);
    unposted = (un ?? []).length;
    ties = trialBalance(await accountsFor(book.id), await postedLines(book.id, end)).ties;
  }
  const openAlerts = ((alerts ?? []) as any[]).filter((a) => alertState(a.bank_alert_events ?? []).state !== "resolved").length;
  const d = (drift ?? [])[0];
  return monthEndChecklist({
    hasBook: Boolean(book),
    unreconciledBankItems: (unrec ?? []).length,
    openBankAlerts: openAlerts,
    unpostedEntries: unposted,
    trialBalanceTies: ties,
    latestDriftMaxCents: d ? Number(d.max_diff_cents) : null,
    driftExplained: Boolean(d?.explanation),
    qboLinked: Boolean(link),
  });
}

export async function prepareCloseSheet(userId: string, i: { offeringId: string; kind: "investor_closing" | "month_end"; key: string; approvalDeadline?: string | undefined | null | undefined; note?: string | undefined | null | undefined }) {
  await staff(userId);
  await fundName(i.offeringId);
  let snapshot: Record<string, unknown>;
  if (i.kind === "investor_closing") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(i.key)) fail("Choose the closing date.");
    const rows = await investorClosingRows(i.offeringId, i.key);
    if (!rows.length) fail("No investors are recorded for that closing date.");
    snapshot = { closingDate: i.key, investors: rows, totals: investorClosingTotals(rows) };
  } else {
    const key = monthKey(i.key);
    snapshot = { month: key, ...(await monthEndFacts(i.offeringId, key)) };
  }
  let { data: sheet } = await db().from("close_sheets").select("id").eq("offering_id", i.offeringId).eq("kind", i.kind).eq("sheet_key", i.key).maybeSingle();
  if (!sheet) {
    const ins = await db().from("close_sheets").insert({ offering_id: i.offeringId, kind: i.kind, sheet_key: i.key, created_by: userId }).select("id").single();
    if (ins.error) fail(ins.error.message);
    sheet = ins.data;
  }
  const { data: last } = await db().from("close_sheet_versions").select("version").eq("sheet_id", sheet.id).order("version", { ascending: false }).limit(1);
  const version = Number(last?.[0]?.version ?? 0) + 1;
  const { data, error } = await db().from("close_sheet_versions").insert({ sheet_id: sheet.id, version, snapshot, approval_deadline: i.approvalDeadline || null, note: i.note ?? null, prepared_by: userId }).select("id, version").single();
  if (error) fail(error.message);
  return data;
}

export async function decideCloseSheet(userId: string, i: { versionId: string; decision: "approved" | "returned"; reason?: string | undefined | null | undefined }) {
  await staff(userId);
  const { data: v } = await db().from("close_sheet_versions").select("id, version, sheet_id, prepared_by, snapshot, close_sheets(offering_id, kind, sheet_key)").eq("id", i.versionId).maybeSingle();
  if (!v) fail("Close sheet version not found.");
  const { data: newer } = await db().from("close_sheet_versions").select("id").eq("sheet_id", v.sheet_id).gt("version", v.version).limit(1);
  if ((newer ?? []).length) fail("A newer version exists. Review that one instead.");
  const why = canDecideCloseSheet(v.prepared_by, userId, i.decision, i.reason);
  if (why) fail(why);
  if (i.decision === "approved" && v.close_sheets.kind === "month_end" && !v.snapshot?.ready) {
    fail("Every checklist item must pass before the month can be signed off.");
  }
  const { error } = await db().from("close_sheet_decisions").insert({ version_id: i.versionId, decision: i.decision, reason: i.reason ?? null, decided_by: userId });
  if (error) fail(/duplicate key/i.test(error.message) ? "This version has already been decided." : error.message);
  let periodNote: string | null = null;
  if (i.decision === "approved" && v.close_sheets.kind === "month_end") {
    const book = await bookFor(v.close_sheets.offering_id);
    const { end } = monthBounds(v.close_sheets.sheet_key);
    const { data: period } = book ? await db().from("accounting_periods").select("id, status").eq("book_id", book.id).eq("period_end", end).maybeSingle() : { data: null };
    if (!period) periodNote = "No accounting period is set up for this month, so there was nothing to lock.";
    else if (period.status === "closed") { await transitionPeriod(userId, period.id, "locked", "Month-end close sheet approved"); periodNote = "The period is now locked."; }
    else if (period.status === "locked") periodNote = "The period was already locked.";
    else periodNote = `The period is ${period.status.replace(/_/g, " ")}; close it first, then lock it.`;
  }
  return { ok: true, periodNote };
}

async function sheetsFor(offeringId: string, approvedOnly: boolean) {
  const { data } = await db()
    .from("close_sheets")
    .select("id, kind, sheet_key, created_at, close_sheet_versions(id, version, snapshot, approval_deadline, note, prepared_by, created_at, close_sheet_decisions(decision, reason, decided_by, created_at))")
    .eq("offering_id", offeringId)
    .order("sheet_key", { ascending: false });
  const sheets = ((data ?? []) as any[]).map((s) => {
    const versions = ((s.close_sheet_versions ?? []) as any[]).sort((a, b) => b.version - a.version).map((v) => {
      const d = Array.isArray(v.close_sheet_decisions) ? v.close_sheet_decisions[0] : v.close_sheet_decisions;
      return { id: v.id, version: v.version, snapshot: v.snapshot, approvalDeadline: v.approval_deadline, note: v.note, preparedBy: v.prepared_by, createdAt: v.created_at, decision: d ?? null };
    });
    return { id: s.id, kind: s.kind, key: s.sheet_key, versions };
  });
  if (!approvedOnly) return sheets;
  return sheets
    .map((s) => ({ ...s, versions: s.versions.filter((v) => v.decision?.decision === "approved").slice(0, 1).map((v) => ({ ...v, preparedBy: null, note: null, decision: { decision: "approved", created_at: v.decision.created_at } })) }))
    .filter((s) => s.versions.length);
}

export async function listCloseSheets(userId: string, offeringId: string) {
  await staff(userId);
  const sheets = await sheetsFor(offeringId, false);
  const ppl = await names(sheets.flatMap((s) => s.versions.flatMap((v: any) => [v.preparedBy, v.decision?.decided_by])));
  const { data: closings } = await db().from("application_closings").select("closing_date").eq("offering_id", offeringId);
  return {
    closingDates: [...new Set(((closings ?? []) as any[]).map((c) => c.closing_date).filter(Boolean))].sort().reverse(),
    sheets: sheets.map((s) => ({ ...s, versions: s.versions.map((v: any) => ({ ...v, mine: v.preparedBy === userId, preparedByName: ppl.get(v.preparedBy) ?? null, decision: v.decision ? { ...v.decision, by: ppl.get(v.decision.decided_by) ?? null } : null })) })),
  };
}

/** Fund managers: approved sheets for their own Fund only, read-only. */
export async function managerCloseSheets(userId: string, offeringId: string) {
  const scope = await reviewerScope(userId);
  assertScopeAllows(scope, offeringId);
  return sheetsFor(offeringId, true);
}
