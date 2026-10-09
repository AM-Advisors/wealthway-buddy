import { guard, step, U, N } from "./lib";
import { trialBalance } from "@/lib/ledger-trial-balance";
const d = await guard();
const fa = await import("@/lib/fund-accounting.server");
const book = (await d.from("ledger_books").select("id").eq("offering_id", N).single()).data.id;
const tb = async () => {
  const a = (await d.from("chart_of_accounts").select("id,code,name,account_type,normal_balance").eq("book_id", book)).data;
  const l = (await d.from("journal_lines").select("account_id,debit_cents,credit_cents,journal_entries!inner(status,book_id)").eq("journal_entries.book_id", book).eq("journal_entries.status", "posted")).data;
  return trialBalance(a, l);
};
const before = await tb();
const jeBefore = (await d.from("journal_entries").select("id", { count: "exact", head: true }).eq("book_id", book)).count;
// missing mapping must block (before audit_tax is mapped)
await step("missing mapping blocks expense", () => fa.prepareExpense(U.prep, { offeringId: N, category: "audit_tax", vendor: "DEMO Probe", description: "probe", invoiceNumber: "PROBE-1", invoiceDate: null, serviceStart: null, serviceEnd: null, expenseDate: "2026-03-01", amountCents: 100, paymentMode: "accrued", paidOn: null, sourceReference: "probe", evidenceReference: null, bankLineId: null }), true);
await step("unknown category -> review", () => fa.prepareExpense(U.prep, { offeringId: N, category: "other", vendor: "DEMO Probe", description: "probe", invoiceNumber: "PROBE-2", invoiceDate: null, serviceStart: null, serviceEnd: null, expenseDate: "2026-03-01", amountCents: 100, paymentMode: "accrued", paidOn: null, sourceReference: "probe", evidenceReference: null, bankLineId: null }), true);
const NEW = [["5210","Legal fees","legal","legal"],["5220","Accounting fees","accounting","accounting"],["5230","Audit and tax fees","audit_tax","audit_tax"],["5240","Professional services","professional_services","professional"],["5250","Fund administration fees","fund_administration","administration"],["5260","Bank fees","bank_fees","bank_fee"]];
for (const [code,name,sub,cat] of NEW) {
  const ex = (await d.from("chart_of_accounts").select("id").eq("book_id", book).eq("code", code)).data;
  const id = ex?.[0]?.id ?? (await step(`add ${code} ${name}`, () => fa.addExpenseAccount(U.prep, { offeringId: N, code, name, subtype: sub, parentCode: "5200", reason: "[WALKTHROUGH-Q1-2026] DEMO: required expense classification; no opening balance" })) as any).id;
  const m = (await d.from("fund_account_mappings").select("account_id").eq("book_id", book).eq("purpose", `expense:${cat}`).eq("active", true)).data;
  if (m?.[0]?.account_id !== id) await step(`map expense:${cat} -> ${code}`, () => fa.setMapping(U.prep, { offeringId: N, purpose: `expense:${cat}`, accountId: id, note: "DEMO Walkthrough chart mapping" }));
}
await step("duplicate account refused", () => fa.addExpenseAccount(U.prep, { offeringId: N, code: "5270", name: "Legal Fees", subtype: "legal", parentCode: "5200", reason: "dup probe" }), true);
await step("liability-type account refused via mapping", async () => fa.setMapping(U.prep, { offeringId: N, purpose: "expense:legal", accountId: (await d.from("chart_of_accounts").select("id").eq("book_id", book).eq("code","2100").single()).data.id, note: "probe" }), true);
const after = await tb();
const jeAfter = (await d.from("journal_entries").select("id", { count: "exact", head: true }).eq("book_id", book)).count;
const bal = (t: any, c: string) => t.rows.find((r: any) => r.code === c)?.balanceCents ?? 0;
console.log("TB", JSON.stringify({ before: [before.totalDebitCents, before.totalCreditCents, before.ties], after: [after.totalDebitCents, after.totalCreditCents, after.ties], sameRows: JSON.stringify(before.rows.map((r:any)=>[r.code,r.balanceCents])) === JSON.stringify(after.rows.map((r:any)=>[r.code,r.balanceCents])), jeBefore, jeAfter }));
console.log("ROWS", JSON.stringify(after.rows.map((r:any)=>[r.code,r.name,r.balanceCents])));
const ol = (await d.from("journal_lines").select("credit_cents,debit_cents,memo,chart_of_accounts(code,name,account_type,subtype),journal_entries!inner(memo,entry_date)").eq("journal_entries.book_id", book).like("journal_entries.memo", "%OPENING%")).data;
console.log("OPEN", JSON.stringify(ol));
const fp: any = await step("fee preview", () => fa.feePreview(U.prep, N, { start: "2026-01-01", end: "2026-03-31" }));
console.log("FEE", fp?.totalNetCents, JSON.stringify(fp?.blocked));
const assets = (await d.from("portfolio_assets").select("issuer_name,cost_basis_cents").eq("offering_id", N)).data;
console.log("ASSETS", JSON.stringify(assets));
const calls = (await d.from("capital_call_lines").select("*").limit(1)).data; console.log("CCL cols", Object.keys(calls?.[0]??{}).join(","));
const docs = (await d.from("fund_liabilities").select("*").eq("offering_id", N)).data; console.log("LIABS", JSON.stringify(docs));
