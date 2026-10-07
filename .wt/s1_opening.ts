import { guard, step, U, N, BATCH } from "./lib";
const d = await guard();
const a5 = await import("@/lib/accounting-phase5.server");
const book = (await step("open book", () => a5.openBook(U.prep, N))) as any;
const { data: coa } = await d.from("chart_of_accounts").select("id,code").eq("book_id", book.id);
const A = (c: string) => coa.find((x: any) => x.code === c).id;
const memo = `[${BATCH}] OPENING: synthetic takeover balances at 2025-12-31 (Phase 1 approved package; NAV $9,950,000)`;
let { data: ex } = await d.from("journal_entries").select("id,status").eq("book_id", book.id).eq("memo", memo);
let id = ex?.[0]?.id;
if (!id) {
  const r: any = await step("draft opening entry (preparer)", () => a5.draftManualEntry(U.prep, { offeringId: N, entryDate: "2025-12-31", memo, lines: [
    { accountId: A("1000"), debitCents: 175_000_000, creditCents: 0, memo: "Operating cash 1,700,000 + MM sweep 50,000 (src 1000+1010)" },
    { accountId: A("1100"), debitCents: 750_000_000, creditCents: 0, memo: "Investments at cost (src 1200)" },
    { accountId: A("1110"), debitCents: 75_000_000, creditCents: 0, memo: "Unrealized appreciation (src 1210)" },
    { accountId: A("2100"), debitCents: 0, creditCents: 5_000_000, memo: "Accrued expenses (src 2000)" },
    { accountId: A("3000"), debitCents: 0, creditCents: 995_000_000, memo: "Partners' capital: contributions 10,000,000 - expenses 800,000 + unrealized 750,000" },
  ] }));
  id = r?.id ?? r?.entryId;
}
const st = async () => (await d.from("journal_entries").select("status").eq("id", id).single()).data.status;
if (await st() === "draft") await step("preparer cannot review own", () => a5.advanceEntry(U.prep, { offeringId: N, entryId: id, to: "reviewed" }), true);
if (await st() === "draft") await step("review (reviewer)", () => a5.advanceEntry(U.rev, { offeringId: N, entryId: id, to: "reviewed" }));
if (await st() === "reviewed") await step("approve (approver)", () => a5.advanceEntry(U.appr, { offeringId: N, entryId: id, to: "approved" }));
if (await st() === "approved") await step("post (preparer)", () => a5.advanceEntry(U.prep, { offeringId: N, entryId: id, to: "posted" }));
console.log("status", await st(), id);
