import { N, U, step, db } from "./lib";
const rc = await import("@/lib/reconciliation.server");
const d = await db();
const BA = (await d.from("bank_accounts").select("id").eq("offering_id", N).single()).data.id;
const txs = [
  { k: "inv", date: "2026-07-20", amt: -200_000_000, name: "[QA] Wire to Portfolio Company Alpha - Series A Preferred" },
  { k: "legal", date: "2026-07-25", amt: -5_000_000, name: "[QA] Legal fees - Law Firm (professional fees)" },
];
for (const t of txs) await step(`simulated bank outflow ${t.k}`, async () => (await d.from("bank_transactions").insert({ offering_id: N, bank_account_id: BA, plaid_transaction_id: `qa3-${t.k}`, dedupe_key: `qa3-${t.k}`, posted_on: t.date, amount_cents: t.amt, name: t.name, direction: "outbound", currency: "USD" }).select("id").single()).data);
await step("classify fund cash (preparer)", () => rc.classifyFundCash(U.prep, N));
const { data } = await d.from("bank_reconciliations").select("id,status,transaction_type,acknowledgement_required,bank_transactions!inner(direction,name)").eq("offering_id", N).eq("bank_transactions.direction", "outbound");
console.log(JSON.stringify(data));
