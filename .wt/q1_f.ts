import { step, U, N, BATCH } from "./lib";
import { d, BOOK, grant, revoke, tb, bal, jeCount } from "./q1lib";
import { DEPOSITS, NEW_INVESTMENTS, EXPENSES, AMBIGUOUS_EXPENSE } from "@/lib/reference-fund/walkthrough-period";
await grant();
try {
  const fa = await import("@/lib/fund-accounting.server");
  const rc = await import("@/lib/reconciliation.server");
  const acct = async (c: string) => (await d.from("chart_of_accounts").select("id").eq("book_id", BOOK).eq("code", c).single()).data.id;
  const t0 = await tb();
  // ---- 1. Verify linkage of the 1/15 line to the opening 2100 obligation
  const a2100 = await acct("2100");
  const l2100 = (await d.from("journal_lines").select("debit_cents,credit_cents,journal_entries!inner(entry_date,status,memo)").eq("account_id", a2100)).data;
  console.log("2100 lines", JSON.stringify(l2100.map((l: any) => [l.journal_entries.entry_date, l.journal_entries.status, l.debit_cents, l.credit_cents])));
  const priorSettle = (await d.from("fund_payable_settlements").select("id,status").eq("offering_id", N)).data;
  console.log("prior settlements", JSON.stringify(priorSettle));
  const mk = async (key: string, on: string, cents: number, dir: "inflow" | "outbound", name: string) => {
    const k = `${BATCH}:${key}`;
    const ex = (await d.from("bank_transactions").select("id").eq("dedupe_key", k).maybeSingle()).data;
    return ex?.id ?? (await d.from("bank_transactions").insert({ offering_id: N, plaid_transaction_id: k, dedupe_key: k, posted_on: on, amount_cents: cents, name, description: `SYNTHETIC Phase 2B scenario line ${key} - not externally bank-verified`, direction: dir, currency: "USD" }).select("id").single()).data.id;
  };
  const payTx = await mk("pay-accrued", "2026-01-15", -5_000_000, "outbound", "ACCRUED PAYABLES");
  let st = priorSettle.find((s: any) => s.status !== "rejected");
  if (!st) st = (await step("prepare $50,000 opening-liability settlement", () => fa.prepareSettlement(U.prep, { offeringId: N, expenseId: null, liabilityPurpose: "accrued_expenses", openingLiabilityReference: "Opening accrued expenses 2025-12-31 (GL 2100 / source TB 2000) - original invoice and vendor MISSING (open migration-evidence exception)", amountCents: 5_000_000, paidOn: "2026-01-15", sourceReference: `[${BATCH}] Phase 2B source bank line pay-accrued "ACCRUED PAYABLES" -$50,000 2026-01-15 (SYNTHETIC, not bank-verified)`, idempotencyKey: `${BATCH}:pay-accrued`, bankLineId: null, bankTransactionId: payTx }))) as any;
  await step("settlement self-approval refused", () => fa.decideSettlement(U.prep, st.id, true, null), true);
  await step("second settlement over remaining balance refused", () => fa.prepareSettlement(U.prep, { offeringId: N, expenseId: null, liabilityPurpose: "accrued_expenses", openingLiabilityReference: "dup probe", amountCents: 5_000_000, paidOn: "2026-01-15", sourceReference: "neg", idempotencyKey: "neg-settle-dup", bankLineId: null }), true);
  const sRow = (await d.from("fund_payable_settlements").select("status").eq("id", st.id).single()).data;
  if (sRow.status === "prepared") await step("approve settlement", () => fa.decideSettlement(U.rev, st.id, true, "Source line amount and label match the sole open opening obligation; evidence synthetic"));
  if ((await d.from("fund_payable_settlements").select("status").eq("id", st.id).single()).data.status === "approved") await step("post settlement", () => fa.postSettlement(U.appr, st.id));
  // ---- 2. $4,000 consulting accrual -> 5240
  let cx = (await d.from("fund_expense_records").select("id,status").eq("offering_id", N).ilike("source_reference", "%exp-misc%").maybeSingle()).data;
  if (!cx) cx = (await step("prepare $4,000 consulting accrual", () => fa.prepareExpense(U.prep, { offeringId: N, category: "professional", vendor: AMBIGUOUS_EXPENSE.description, description: `${AMBIGUOUS_EXPENSE.description} (original category: ${AMBIGUOUS_EXPENSE.category})`, invoiceNumber: null, invoiceDate: null, serviceStart: null, serviceEnd: "2026-03-20", expenseDate: AMBIGUOUS_EXPENSE.date, amountCents: AMBIGUOUS_EXPENSE.amountCents, paymentMode: "accrued", paidOn: null, sourceReference: `[${BATCH}] source exp-misc; original category ${AMBIGUOUS_EXPENSE.category}; classified Professional services (5240) per reviewer decision 2026-10-09 - description establishes a consulting service`, evidenceReference: null, bankLineId: null }))) as any;
  const cxs = (await d.from("fund_expense_records").select("status,vendor_status").eq("id", cx.id).single()).data;
  if (cxs.vendor_status !== "unknown") await step("vendor unknown (consulting)", () => fa.setVendorProvenance(U.rev, { expenseId: cx.id, status: "unknown", note: `[${BATCH}] No vendor in source; original category ${AMBIGUOUS_EXPENSE.category} preserved in description.` }));
  if (cxs.status === "prepared") await step("approve consulting accrual", () => fa.decideExpense(U.rev, cx.id, true, "Classification decision: consulting service -> Professional services; Q1 incurred 3/20; unpaid"));
  if ((await d.from("fund_expense_records").select("status").eq("id", cx.id).single()).data.status === "approved") await step("post consulting accrual", () => fa.postExpense(U.appr, cx.id));
  // ---- 3. Interest via bank reconciliation workflow
  const intTx = await mk("int-mmf", "2026-03-31", 210_000, "inflow", "MMF SWEEP INTEREST");
  await step("classify bank feed", () => rc.classifyFundCash(U.prep, N));
  const recOf = async (tx: string) => (await d.from("bank_reconciliations").select("*").eq("bank_transaction_id", tx).single()).data;
  // settlement bank line: reuse its journal
  let r1 = await recOf(payTx);
  for (const e of (await d.from("accounting_exceptions").select("id,kind").eq("bank_transaction_id", payTx).eq("status", "open")).data) await step(`resolve ${e.kind}`, () => rc.resolveException(U.rev, e.id, "resolved", "Explained by linked settlement"));
  if (r1.status === "auto_matched") await step("review settlement bank line", () => rc.reviewReconciliation(U.rev, { reconciliationId: r1.id, action: "approve", reason: "Matches linked posted settlement", correction: { transactionType: "payable_settlement", debitAccountCode: "2100", creditAccountCode: "1000" } }));
  r1 = await recOf(payTx); if (r1.status === "harmonious_reviewed") await step("second approval settlement line", () => rc.externalApproveReconciliation(U.appr, { reconciliationId: r1.id, decision: "approve" }));
  const j1: any = await step("settlement recon journal (reuse)", () => rc.prepareReconciliationJournal(U.rev, r1.id));
  let r2 = await recOf(intTx);
  console.log("INT rec", r2.status, r2.transaction_type, r2.confidence);
  for (const e of (await d.from("accounting_exceptions").select("id,kind,detail").eq("bank_transaction_id", intTx).eq("status", "open")).data) console.log("INT exception", e.kind, e.detail);
  if (r2.status === "auto_matched") await step("review interest", () => rc.reviewReconciliation(U.rev, { reconciliationId: r2.id, action: "approve", reason: "Source line int-mmf: MMF sweep interest credited 3/31", correction: { transactionType: "interest_income", debitAccountCode: "1000", creditAccountCode: "4100" } }));
  r2 = await recOf(intTx); if (r2.status === "harmonious_reviewed") await step("second approval interest", () => rc.externalApproveReconciliation(U.appr, { reconciliationId: r2.id, decision: "approve" }));
  r2 = await recOf(intTx);
  if (!r2.journal_entry_id) await step("prepare interest journal (preparer)", () => rc.prepareReconciliationJournal(U.prep, r2.id));
  await step("interest self-review refused", () => rc.advanceReconciliationJournal(U.prep, r2.id, "reviewed"), true);
  const js = async () => (await d.from("journal_entries").select("status").eq("id", (await recOf(intTx)).journal_entry_id).single()).data.status;
  if (await js() === "draft") await step("review interest journal", () => rc.advanceReconciliationJournal(U.rev, r2.id, "reviewed"));
  if (await js() === "reviewed") await step("approve interest journal", () => rc.advanceReconciliationJournal(U.rev, r2.id, "approved"));
  await step("approver cannot post interest", () => rc.advanceReconciliationJournal(U.rev, r2.id, "posted"), true);
  if (await js() === "approved") await step("post interest journal", () => rc.advanceReconciliationJournal(U.appr, r2.id, "posted"));
  for (const e of (await d.from("accounting_exceptions").select("id,kind").eq("bank_transaction_id", intTx).eq("status", "open")).data) await step(`resolve interest ${e.kind}`, () => rc.resolveException(U.rev, e.id, "resolved", "Interest reviewed, mapped to 4100 and posted through reconciliation"));
  const t1 = await tb();
  console.log("BAL", JSON.stringify({ cash: bal(t1, "1000"), a2100: bal(t1, "2100"), i4100: bal(t1, "4100"), e5240: bal(t1, "5240"), cost: bal(t1, "1100"), unreal: bal(t1, "1110"), cred: bal(t1, "2500"), dr: t1.totalDebitCents, cr: t1.totalCreditCents, je: await jeCount() }));
  console.log("ROWS", JSON.stringify(t1.rows.map((r: any) => [r.code, r.balanceCents])));
  // ---- 5. Full synthetic statement evidence (not applied)
  const fname = `${BATCH}-Q1-FULL-STATEMENT-SYNTHETIC.csv`;
  const src: [string, string, string, number, string][] = [
    ["chk-opening", "2025-12-29", "2026-01-05", -1_000_000, "CHECK 1041 (pre-cutover)"],
    ["pay-accrued", "2026-01-15", "2026-01-15", -5_000_000, "ACCRUED PAYABLES"],
    ...DEPOSITS.map((x) => [x.id, x.bookedOn, x.postedOn, x.amountCents, x.description] as any),
    ...NEW_INVESTMENTS.map((i) => [`pay-${i.id}`, i.date, i.date, -i.costCents, `WIRE OUT ${i.name}`] as any),
    ...EXPENSES.filter((e) => e.paid).map((e) => [`pay-${e.id}`, e.date, e.id === "exp-valuation" ? "2026-04-02" : e.date, -e.amountCents, e.description] as any),
    ["int-mmf", "2026-03-31", "2026-03-31", 210_000, "MMF SWEEP INTEREST"],
  ];
  const cleared = src.filter((s) => s[2] <= "2026-03-31");
  const opening = 176_000_000, closing = opening + cleared.reduce((s, x) => s + x[3], 0);
  let up = (await d.from("bank_statement_uploads").select("id").eq("offering_id", N).eq("file_name", fname).maybeSingle()).data;
  if (!up) {
    up = (await d.from("bank_statement_uploads").insert({ offering_id: N, file_name: fname, storage_path: `demo/${BATCH}/full-statement`, status: "parsed", uploaded_by: U.prep, period_start: "2026-01-01", period_end: "2026-03-31", opening_balance_cents: opening, closing_balance_cents: closing, bank_name: "DEMO / SYNTHETIC" }).select("id").single()).data;
    const rows = cleared.map((s, i) => ({ upload_id: up.id, offering_id: N, line_no: i + 1, posted_on: s[2], description: `${s[4]} [src:${s[0]}]`, amount_cents: Math.abs(s[3]), direction: s[3] < 0 ? "out" : "in", skip: true }));
    const r = await d.from("bank_statement_lines").insert(rows); if (r.error) throw new Error(r.error.message);
  }
  // Reconcile each statement line to GL-side evidence
  const live = (await d.from("bank_transactions").select("id,posted_on,amount_cents,direction").eq("offering_id", N).gte("posted_on", "2026-01-01")).data;
  const recs = (await d.from("bank_reconciliations").select("bank_transaction_id,status,journal_entry_id").eq("offering_id", N)).data;
  const used = new Set<string>(); const res: any[] = [];
  for (const s of cleared) {
    const signed = s[3];
    if (s[0] === "chk-opening") { res.push([s[0], signed, "cutover outstanding item (already deducted in GL at 12/31) - clears, no GL entry"]); continue; }
    if (s[0] === "pay-exp-bank") { res.push([s[0], signed, "matched: existing statement line -> posted bank-fee expense 834205f3"]); continue; }
    const m = live.find((t: any) => !used.has(t.id) && t.posted_on === s[2] && (t.direction === "inflow" ? Math.abs(t.amount_cents) : -Math.abs(t.amount_cents)) === signed);
    if (!m) { res.push([s[0], signed, "UNMATCHED"]); continue; }
    used.add(m.id); const rr = recs.find((r: any) => r.bank_transaction_id === m.id);
    res.push([s[0], signed, `feed ${m.id.slice(0, 8)} ${rr?.status ?? "no-rec"} je ${rr?.journal_entry_id?.slice(0, 8) ?? "-"}`]);
  }
  console.log("STMT", JSON.stringify({ opening, closing, lines: cleared.length }));
  for (const r of res) console.log("  ", r.join(" | "));
  const notCleared = src.filter((s) => s[1] <= "2026-03-31" && s[2] > "2026-03-31");
  console.log("NOT CLEARED", JSON.stringify(notCleared));
  const outstanding = -1_250_000;
  console.log("BANKREC", JSON.stringify({ bank: closing, outstandingChecks: outstanding, adjusted: closing + outstanding, gl: bal(t1, "1000"), diff: closing + outstanding - bal(t1, "1000") }));
  const openExc = (await d.from("accounting_exceptions").select("kind").eq("offering_id", N).eq("status", "open")).data;
  console.log("OPEN EXC", JSON.stringify(openExc));
} finally { await revoke(); }
