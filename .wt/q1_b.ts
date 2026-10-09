import { step, U, N, BATCH } from "./lib";
import { d, BOOK, grant, revoke, tb, bal, jeCount } from "./q1lib";
import { EXPENSES, AMBIGUOUS_EXPENSE } from "@/lib/reference-fund/walkthrough-period";
await grant();
try {
  const fa = await import("@/lib/fund-accounting.server");
  const rc = await import("@/lib/reconciliation.server");
  // Withdraw the two stray negative-test records through the normal rejection path.
  for (const k of ["neg-dup2", "neg-locked"]) { const r = (await d.from("fund_investment_transactions").select("id,status").eq("offering_id", N).eq("idempotency_key", k).maybeSingle()).data; if (r?.status === "prepared") await step(`reject stray ${k}`, () => fa.decideInvestment(U.rev, r.id, false, `[${BATCH}] negative-test artefact (defect fixed); never approved or posted`)); }
  const n0 = (await d.from("fund_investment_transactions").select("id", { count: "exact", head: true }).eq("offering_id", N)).count;
  await step("re-test: duplicate open/posted purchase refused", () => fa.prepareInvestment(U.prep, { offeringId: N, kind: "purchase", assetId: null, newIssuerName: "Northstar Analytics, Inc.", newAssetName: "Series A Preferred", newAssetClass: null, instrument: null, tradeDate: "2026-02-20", settlementDate: null, quantity: null, unitPriceCents: null, principalCents: 1, transactionCostCents: 0, sourceReference: "neg", evidenceReference: null, idempotencyKey: "neg-dup3", bankLineId: null }), true);
  await step("re-test: locked period refused before any record", () => fa.prepareInvestment(U.prep, { offeringId: N, kind: "purchase", assetId: null, newIssuerName: "DEMO Locked Probe 2", newAssetName: "Common", newAssetClass: null, instrument: null, tradeDate: "2025-12-15", settlementDate: null, quantity: null, unitPriceCents: null, principalCents: 1, transactionCostCents: 0, sourceReference: "neg", evidenceReference: null, idempotencyKey: "neg-locked2", bankLineId: null }), true);
  const n1 = (await d.from("fund_investment_transactions").select("id", { count: "exact", head: true }).eq("offering_id", N)).count;
  console.log("RECORDS before/after refusals", n0, n1);
  const tx = async (k: string) => (await d.from("bank_transactions").select("id").eq("dedupe_key", `${BATCH}:out:${k}`).single()).data.id;
  // Statement line for the bank fee (synthetic statement, source line pay-exp-bank).
  let up = (await d.from("bank_statement_uploads").select("id").eq("offering_id", N).eq("file_name", `${BATCH}-march-statement-DEMO.csv`).maybeSingle()).data;
  if (!up) { const r = await d.from("bank_statement_uploads").insert({ offering_id: N, file_name: `${BATCH}-march-statement-DEMO.csv`, storage_path: `demo/${BATCH}/none`, status: "parsed", uploaded_by: U.prep }).select("id").single(); if (r.error) throw new Error(r.error.message); up = r.data; }
  let line = (await d.from("bank_statement_lines").select("id").eq("upload_id", up.id).maybeSingle()).data;
  if (!line) { const r = await d.from("bank_statement_lines").insert({ upload_id: up.id, offering_id: N, line_no: 1, posted_on: "2026-03-31", description: "DEMO wire fees", amount_cents: 25000, direction: "out", suggested_category: null, skip: false }).select("id").single(); if (r.error) throw new Error(r.error.message); line = r.data; }
  const cat: Record<string, string> = { legal: "legal", administration: "administration", bank_fee: "bank_fee", audit_tax: "audit_tax", other_professional: "professional" };
  const ids: Record<string, string> = {};
  for (const e of EXPENSES) {
    const ex = (await d.from("fund_expense_records").select("id,status").eq("offering_id", N).ilike("source_reference", `%${e.id}%`).maybeSingle()).data;
    if (ex) { ids[e.id] = ex.id; continue; }
    const link = e.id === "exp-bank" ? { bankLineId: line.id, bankTransactionId: null } : e.paid && e.id !== "exp-valuation" ? { bankLineId: null, bankTransactionId: await tx(e.id) } : { bankLineId: null, bankTransactionId: null };
    const r: any = await step(`prepare ${e.id}`, () => fa.prepareExpense(U.prep, { offeringId: N, category: cat[e.category!], vendor: e.description.replace(/ - Q1$/, ""), description: e.description, invoiceNumber: null, invoiceDate: null, serviceStart: "2026-01-01", serviceEnd: "2026-03-31", expenseDate: e.date, amountCents: e.amountCents, paymentMode: e.paid ? "paid" : "accrued", paidOn: e.paid ? e.date : null, sourceReference: `[${BATCH}] source ${e.id} (walkthrough-period EXPENSES)`, evidenceReference: e.id === "exp-valuation" ? "DEMO check issued 3/30, clears 4/2 (outstanding)" : null, ...link }));
    ids[e.id] = r.id;
  }
  await step("ambiguous expense -> REVIEW REQUIRED, not entered", () => fa.prepareExpense(U.prep, { offeringId: N, category: AMBIGUOUS_EXPENSE.category!, vendor: "DEMO consulting", description: AMBIGUOUS_EXPENSE.description, invoiceNumber: null, invoiceDate: null, serviceStart: null, serviceEnd: null, expenseDate: AMBIGUOUS_EXPENSE.date, amountCents: AMBIGUOUS_EXPENSE.amountCents, paymentMode: "accrued", paidOn: null, sourceReference: "exp-misc", evidenceReference: null, bankLineId: null }), true);
  await step("duplicate expense refused", () => fa.prepareExpense(U.prep, { offeringId: N, category: "legal", vendor: "DEMO fund counsel", description: "again", invoiceNumber: null, invoiceDate: null, serviceStart: null, serviceEnd: null, expenseDate: "2026-02-28", amountCents: 4_500_000, paymentMode: "accrued", paidOn: null, sourceReference: "neg", evidenceReference: null, bankLineId: null }), true);
  await step("statement line linked twice refused", () => fa.prepareExpense(U.prep, { offeringId: N, category: "bank_fee", vendor: "DEMO other", description: "x", invoiceNumber: "X-1", invoiceDate: null, serviceStart: null, serviceEnd: null, expenseDate: "2026-03-31", amountCents: 25000, paymentMode: "paid", paidOn: "2026-03-31", sourceReference: "neg", evidenceReference: null, bankLineId: line.id }), true);
  await step("expense self-approval refused", () => fa.decideExpense(U.prep, ids["exp-legal"], true, null), true);
  // E2E: reconcile the legal payment BEFORE its expense is posted -> must wait, no cash entry.
  await step("classify bank feed", () => rc.classifyFundCash(U.prep, N));
  const recFor = async (k: string) => (await d.from("bank_reconciliations").select("id,status,transaction_type,journal_entry_id").eq("bank_transaction_id", await tx(k)).maybeSingle()).data;
  console.log("REC legal", JSON.stringify(await recFor("exp-legal")));
  for (const id of Object.values(ids)) await step(`approve expense`, () => fa.decideExpense(U.rev, id, true, "DEMO source checked"));
  await step("approver cannot post expense", () => fa.postExpense(U.rev, ids["exp-legal"]), true);
  // Try reconciling legal while approved-not-posted
  const rl = await recFor("exp-legal");
  if (rl) {
    await step("reconcile legal (review)", () => rc.reviewReconciliation(U.rev, { reconciliationId: rl.id, action: "approve", reason: "Matches posted DEMO expense", correction: { transactionType: "fund_expense", debitAccountCode: "5210", creditAccountCode: "1000" } }));
    await step("recon journal while expense not posted -> wait", () => rc.prepareReconciliationJournal(U.rev, rl.id), true);
  }
  for (const id of Object.values(ids)) await step(`post expense`, () => fa.postExpense(U.appr, id));
  await step("settle audit accrual above outstanding refused", () => fa.prepareSettlement(U.prep, { offeringId: N, expenseId: ids["exp-audit"], liabilityPurpose: "accrued_expenses", openingLiabilityReference: null, amountCents: 4_000_000, paidOn: "2026-03-31", sourceReference: "neg", idempotencyKey: "neg-over", bankLineId: null }), true);
  console.log("JE", await jeCount());
} finally { await revoke(); }
