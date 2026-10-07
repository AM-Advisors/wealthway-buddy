import { N, U, step } from "./lib";
const a5 = await import("@/lib/accounting-phase5.server");
const [date, label] = [process.argv[2]!, process.argv[3]!];
const e: any = await step(`${label} management fee accrual $16,666.67 (manual bridge B1, preparer)`, () => a5.draftManualEntry(U.prep, { offeringId: N, entryDate: date, memo: `[QA] ${label} management fee accrual 2% x $10M / 12`, lines: [
  { accountId: "3dbadc0e-05c9-4d9f-9721-df4e847718a6", debitCents: 1_666_667, creditCents: 0 },
  { accountId: "be055753-bf0d-49ed-a97a-5dd042d72116", debitCents: 0, creditCents: 1_666_667 } ] }));
const id = e?.id ?? e?.entryId;
await step(`${label} fee reviewed (reviewer)`, () => a5.advanceEntry(U.rev, { offeringId: N, entryId: id, to: "reviewed" }));
await step(`${label} fee approved (approver)`, () => a5.advanceEntry(U.appr, { offeringId: N, entryId: id, to: "approved" }));
await step(`${label} fee posted (preparer)`, () => a5.advanceEntry(U.prep, { offeringId: N, entryId: id, to: "posted" }));
const lv: any = await a5.ledgerView(U.prep, N, date);
console.log("TB", JSON.stringify({ ties: lv.trialBalance?.ties, d: lv.trialBalance?.totalDebitCents, c: lv.trialBalance?.totalCreditCents, cash: lv.cashCents, rows: lv.trialBalance?.rows?.map((r: any) => [r.code, r.balanceCents]) }));
