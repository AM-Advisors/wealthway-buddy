import { N, U, step, db } from "./lib";
const cc = await import("@/lib/capital-calls.server");
const d = await db();
const BA = (await d.from("bank_accounts").select("id").eq("offering_id", N).single()).data.id;
const callNo = process.argv[2] ?? "1"; const date = process.argv[3] ?? "2026-07-10";
const { data: ef } = await d.from("expected_fundings").select("*, capital_call_lines!inner(capital_call_id, display_name, capital_calls!inner(title))").eq("offering_id", N).eq("status", "expected");
for (const e of (process.argv[4] === "post" ? [] : ef ?? [])) {
  const nm = String(e.capital_call_lines.display_name);
  await step(`simulated bank receipt call ${callNo} ${nm}`, async () => (await d.from("bank_transactions").insert({ offering_id: N, bank_account_id: BA, plaid_transaction_id: `qa3-call${callNo}-${nm}`, dedupe_key: `qa3-call${callNo}-${nm}`, posted_on: date, amount_cents: e.expected_amount_cents, name: `[QA] Wire from ${nm}`, description: `[QA] ref ${e.reference_code}`, reference: e.reference_code, direction: "inflow", currency: "USD" }).select("id").single()).data);
}
if (process.argv[4] !== "post") await step(`detect matches call ${callNo}`, () => cc.detectFundingMatches(U.prep, N));
if (process.argv[4] !== "post") await step(`detect again is idempotent call ${callNo}`, () => cc.detectFundingMatches(U.prep, N));
const { data: ms } = await d.from("funding_matches").select("id,status").eq("offering_id", N).in("status", ["proposed","suggested","pending_review"]);
for (const m of ms ?? []) {
  await step(`approve match ${m.id.slice(0,6)} (reviewer)`, () => cc.decideFundingMatch(U.rev, { matchId: m.id, decision: "approve" }));
  await step(`reviewer cannot post own approval ${m.id.slice(0,6)}`, () => cc.postFundingMatch(U.rev, m.id), true);
  await step(`post contribution ${m.id.slice(0,6)} (approver)`, () => cc.postFundingMatch(U.appr, m.id));
}
