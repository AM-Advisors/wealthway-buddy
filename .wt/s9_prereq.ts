import { appendFileSync } from "node:fs";
import { guard, step, U, N, BATCH } from "./lib";
const d = await guard();
const fa = await import("@/lib/fund-accounting.server");
const BOOK = "d1fd4e89-8028-4aec-b0a6-9901e48efe03";
const jBefore = (await d.from("journal_entries").select("id", { count: "exact", head: true }).eq("book_id", BOOK)).count;
for (const [k, uid] of Object.entries(U)) { await d.from("user_roles").upsert({ user_id: uid, role: "admin" }, { onConflict: "user_id,role", ignoreDuplicates: true }); appendFileSync("/tmp/wt/grants.jsonl", JSON.stringify({ account: k, role: "admin", purpose: `${BATCH} prerequisites setup (temporary)`, grantedAt: new Date().toISOString() }) + "\n"); }
try {
  const { data: accts } = await d.from("chart_of_accounts").select("id,code").eq("book_id", BOOK);
  const id = (c: string) => accts.find((a: any) => a.code === c).id;
  const M: [string, string][] = [["cash", "1000"], ["investment_cost", "1100"], ["accounts_payable", "2000"], ["accrued_expenses", "2100"], ["expense:organizational", "5100"], ["expense:operating", "5200"]];
  const { data: have } = await d.from("fund_account_mappings").select("purpose").eq("book_id", BOOK).eq("active", true);
  for (const [p, c] of M) if (!have.some((h: any) => h.purpose === p)) await step(`map ${p}->${c}`, () => fa.setMapping(U.prep, { offeringId: N, purpose: p, accountId: id(c), note: "DEMO Walkthrough chart mapping" }));
  await step("wrong-type mapping refused", () => fa.setMapping(U.prep, { offeringId: N, purpose: "cash", accountId: id("5000"), note: null }), true);

  const { data: cls } = await d.from("investor_classes").select("id,code,effective_from").eq("offering_id", N);
  const { data: existing } = await d.from("management_fee_terms").select("id").eq("offering_id", N);
  if (!existing.length) {
    const start = cls[0].effective_from; // 2025-01-01, from the existing class records
    const std: any = await step("prepare fund standard 2.00%", () => fa.prepareFeeTerm(U.prep, { offeringId: N, classId: null, positionId: null, sideLetterId: null, basis: "committed_capital", rateBps: 200, frequency: "quarterly", startsOn: start, endsOn: null, sourceDocument: "fund_fee_terms 25f44afe (active, 2% committed capital)", note: "DEMO / SYNTHETIC", supersedesTermId: null }));
    const ca: any = await step("prepare Class A 2.00%", () => fa.prepareFeeTerm(U.prep, { offeringId: N, classId: cls.find((c: any) => c.code === "A").id, positionId: null, sideLetterId: null, basis: "committed_capital", rateBps: 200, frequency: "quarterly", startsOn: start, endsOn: null, sourceDocument: "investor_classes Class A (DEMO) v1", note: "DEMO / SYNTHETIC", supersedesTermId: null }));
    const cb: any = await step("prepare Class B 1.50%", () => fa.prepareFeeTerm(U.prep, { offeringId: N, classId: cls.find((c: any) => c.code === "B").id, positionId: null, sideLetterId: null, basis: "committed_capital", rateBps: 150, frequency: "quarterly", startsOn: start, endsOn: null, sourceDocument: "investor_classes Class B (DEMO) v1", note: "DEMO / SYNTHETIC", supersedesTermId: null }));
    const { data: nwPos } = await d.from("investor_positions").select("id").eq("offering_id", N).eq("display_name", "Northwind Family Office LLC").single();
    const { data: sl } = await d.from("side_letters").select("id,effective_date").eq("offering_id", N).eq("investor_label", "Northwind Family Office LLC").single();
    const nw: any = await step("prepare Northwind 1.50% (side letter PROPOSED)", () => fa.prepareFeeTerm(U.prep, { offeringId: N, classId: null, positionId: nwPos.id, sideLetterId: sl.id, basis: "committed_capital", rateBps: 150, frequency: "quarterly", startsOn: sl.effective_date, endsOn: null, sourceDocument: "side_letters ee696ae2 - DEMO / SYNTHETIC side letter (1.50%, proposed)", note: "Historical 1.25% test assumption is unsupported; see gap register.", supersedesTermId: null }));
    await step("preparer self-approve refused", () => fa.decideFeeTerm(U.prep, std.id, true, "self"), true);
    for (const t of [std, ca, cb]) await step("approve term", () => fa.decideFeeTerm(U.appr, t.id, true, "Matches existing approved fund/class records"));
    await step("Northwind approval refused while side letter proposed", () => fa.decideFeeTerm(U.appr, nw.id, true, "attempt"), true);
    const upd = await d.from("management_fee_terms").update({ rate_bps: 1 }).eq("id", std.id); console.log("edit approved term:", upd.error ? "REFUSED" : "UPDATED (BUG)");
  }
  const p: any = await fa.feePreview(U.rev, N, { start: "2026-01-01", end: "2026-03-31" });
  console.log("PREVIEW", p.totalNetCents / 100, "blocked", p.blocked);
  console.log(JSON.stringify(p.lines.map((l: any) => [l.name, l.appliedLevel, l.effectiveRateBps, l.basisAmountCents / 100, l.netFeeCents / 100])));
  await step("expense with unmapped legal refused", () => fa.prepareExpense(U.prep, { offeringId: N, category: "legal", vendor: "probe", description: "probe", invoiceNumber: null, invoiceDate: null, serviceStart: null, serviceEnd: null, expenseDate: "2026-02-28", amountCents: 1, paymentMode: "paid", paidOn: "2026-02-28", sourceReference: "probe", evidenceReference: null, bankLineId: null }), true);
  const jAfter = (await d.from("journal_entries").select("id", { count: "exact", head: true }).eq("book_id", BOOK)).count;
  console.log("journals before", jBefore, "after", jAfter);
} finally {
  for (const uid of Object.values(U)) await d.from("user_roles").delete().eq("user_id", uid).in("role", ["admin", "operations"]);
  appendFileSync("/tmp/wt/grants.jsonl", JSON.stringify({ revokedAt: new Date().toISOString() }) + "\n"); console.log("access removed");
}
