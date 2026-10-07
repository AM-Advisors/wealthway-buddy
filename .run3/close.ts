import { N, U, step, db } from "./lib";
const a5 = await import("@/lib/accounting-phase5.server");
const acc = await import("@/lib/accounting.server");
const [key, end, cashStr] = [process.argv[2]!, process.argv[3]!, process.argv[4]!];
const d = await db();
const BOOK = "1e596e36-1689-4fbd-9344-8f64d41ec3b9";
let period = (await d.from("accounting_periods").select("*").eq("book_id", BOOK).eq("period_end", end).maybeSingle()).data;
if (!period) period = await step(`${key} open accounting period`, () => acc.openPeriod(U.prep, { bookId: BOOK, label: `[QA] ${key}`, periodStart: `${key}-01`, periodEnd: end }));
const BA = (await d.from("bank_accounts").select("id").eq("offering_id", N).single()).data.id;
if (!(await d.from("bank_balance_snapshots").select("id").eq("offering_id", N).eq("as_of", end).limit(1)).data?.length) await step(`${key} record period-end statement balance ${cashStr} (manual bridge B3, preparer)`, () => a5.recordManualBalance(U.prep, { offeringId: N, asOf: end, balanceCents: Number(cashStr), bankAccountId: BA, statementPeriodStart: `${key}-01`, statementEndDate: end, sourceKind: "manual" }));
const snap0 = (await d.from("bank_balance_snapshots").select("id").eq("offering_id", N).eq("as_of", end).order("created_at", { ascending: false }).limit(1).single()).data;
const snap = snap0; const sr = (await d.from("bank_balance_snapshots").select("reviewed_by").eq("id", snap.id).single()).data;
if (!sr.reviewed_by) await step(`${key} preparer cannot review own balance`, () => a5.reviewBankStatementBalance(U.prep, snap.id), true);
if (!sr.reviewed_by) await step(`${key} statement balance reviewed (reviewer)`, () => a5.reviewBankStatementBalance(U.rev, snap.id));
await step(`${key} close before close sheet approval is blocked (M7)`, async () => { for (const s of ["soft_closed", "review", "closed"] as const) { const p = (await d.from("accounting_periods").select("status").eq("id", period.id).single()).data; if (p.status === s) continue; await acc.transitionPeriod(U.appr, period.id, s, "[QA]"); } }, true);
const sheet: any = await step(`${key} prepare month-end close sheet (preparer)`, () => a5.prepareCloseSheet(U.prep, { offeringId: N, kind: "month_end", key }));
const ver = (await d.from("close_sheet_versions").select("id,snapshot,close_sheets!inner(offering_id,sheet_key)").eq("close_sheets.offering_id", N).eq("close_sheets.sheet_key", key).order("version", { ascending: false }).limit(1).single()).data;
console.log("CHECKLIST", JSON.stringify(ver.snapshot?.checklist ?? ver.snapshot?.items ?? ver.snapshot));
await step(`${key} preparer cannot approve own close sheet`, () => a5.decideCloseSheet(U.prep, { versionId: ver.id, decision: "approved" }), true);
await step(`${key} close sheet approved (reviewer)`, () => a5.decideCloseSheet(U.rev, { versionId: ver.id, decision: "approved" }));
for (const s of ["soft_closed", "review", "closed", "locked"] as const) {
  const p = (await d.from("accounting_periods").select("status").eq("id", period.id).single()).data;
  if (p.status === s) continue;
  await step(`${key} period -> ${s} (approver)`, () => acc.transitionPeriod(U.appr, period.id, s, "[QA] month-end"));
}
console.log("PERIOD", JSON.stringify((await d.from("accounting_periods").select("status,locked_at").eq("id", period.id).single()).data));
