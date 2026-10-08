import { appendFileSync } from "node:fs";
import { guard, step, U, N, BATCH } from "./lib";
const d = await guard();
const cc = await import("@/lib/capital-calls.server");
for (const [k, uid] of Object.entries(U)) for (const role of ["operations", "admin"]) {
  await d.from("user_roles").upsert({ user_id: uid, role }, { onConflict: "user_id,role", ignoreDuplicates: true });
  appendFileSync("/tmp/wt/grants.jsonl", JSON.stringify({ account: k, role, purpose: `${BATCH} overpayment checkpoint (temporary)`, grantedAt: new Date().toISOString() }) + "\n");
}
try {
  const { data: tx } = await d.from("bank_transactions").select("id,amount_cents").eq("dedupe_key", `${BATCH}:dep:ada`).single();
  const { data: m } = await d.from("funding_matches").select("id,status").eq("bank_transaction_id", tx.id).single();
  if (m.status === "proposed") {
    await step("no disposition -> refused", () => cc.decideFundingMatch(U.prep, { matchId: m.id, decision: "approve" }), true);
    await step("hold as credit without reason -> refused", () => cc.decideFundingMatch(U.prep, { matchId: m.id, decision: "approve", overpaymentDisposition: "hold_as_investor_credit" }), true);
    await step("apply Okafor: $300,000 contribution + $50 investor credit", () => cc.decideFundingMatch(U.prep, { matchId: m.id, decision: "approve", overpaymentDisposition: "hold_as_investor_credit", reason: "Synthetic $50 overpayment; investor intent unknown, held as investor credit pending Q2 refund test" }));
  }
  await step("reprocess same deposit", () => cc.decideFundingMatch(U.prep, { matchId: m.id, decision: "approve", overpaymentDisposition: "hold_as_investor_credit", reason: "duplicate test" }), true);
  const mm = (await d.from("funding_matches").select("id,status").eq("id", m.id).single()).data;
  if (mm.status === "approved") { await step("review+approve journal", () => cc.postFundingMatch(U.rev, m.id)); await step("post", () => cc.postFundingMatch(U.appr, m.id)); }
  await step("post twice", () => cc.postFundingMatch(U.appr, m.id), true);
  const cr = await d.from("investor_credits").insert({ offering_id: N, position_id: "00000000-0000-0000-0000-000000000000", bank_transaction_id: tx.id, received_cents: 1, applied_cents: 0, excess_cents: 1, balance_cents: 1, received_on: "2026-02-13", reason: "duplicate", created_by: U.prep });
  console.log("duplicate credit for same deposit:", cr.error ? "REFUSED" : "INSERTED (BUG)");
  const { data: c } = await d.from("investor_credits").select("*").eq("bank_transaction_id", tx.id).single();
  const neg = await d.from("investor_credits").update({ balance_cents: -1 }).eq("id", c.id);
  console.log("credit to negative:", neg.error ? "REFUSED" : "UPDATED (BUG)");
  const rw = await d.from("investor_credits").update({ excess_cents: 100 }).eq("id", c.id);
  console.log("rewrite credit facts:", rw.error ? "REFUSED" : "UPDATED (BUG)");
  console.log("CREDIT", JSON.stringify({ received: c.received_cents / 100, applied: c.applied_cents / 100, excess: c.excess_cents / 100, balance: c.balance_cents / 100, status: c.status, journal: c.journal_entry_id }));
  const { data: jl } = await d.from("journal_lines").select("debit_cents,credit_cents,chart_of_accounts(code)").eq("entry_id", c.journal_entry_id);
  console.log("JOURNAL", JSON.stringify(jl?.map((l: any) => [l.chart_of_accounts?.code, (l.debit_cents ?? 0) / 100, (l.credit_cents ?? 0) / 100])));
  const { data: je } = await d.from("journal_entries").select("status,prepared_by,reviewed_by,approved_by,posted_by").eq("id", c.journal_entry_id).single(); console.log("JE", JSON.stringify(je));
} finally {
  for (const uid of Object.values(U)) await d.from("user_roles").delete().eq("user_id", uid).in("role", ["admin", "operations"]);
  appendFileSync("/tmp/wt/grants.jsonl", JSON.stringify({ revokedAt: new Date().toISOString() }) + "\n");
  console.log("temporary access removed");
}
