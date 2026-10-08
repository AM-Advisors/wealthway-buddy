import { appendFileSync } from "node:fs";
import { guard, step, U, N, BATCH } from "./lib";
const d = await guard();
const cc = await import("@/lib/capital-calls.server");
const rc = await import("@/lib/reconciliation.server");
for (const [k, uid] of Object.entries(U)) for (const role of ["operations", "admin"]) {
  const { error } = await d.from("user_roles").upsert({ user_id: uid, role }, { onConflict: "user_id,role", ignoreDuplicates: true });
  appendFileSync("/tmp/wt/grants.jsonl", JSON.stringify({ account: k, uid, role, purpose: `${BATCH} payments checkpoint (temporary)`, grantedAt: new Date().toISOString() }) + "\n");
  console.log("grant", k, role, error?.message ?? "ok");
}
try {
  const acct = { id: null }; // bank_accounts requires a provider item; DEMO manual cash has no account row (gap)
  const { data: ef } = await d.from("expected_fundings").select("id,reference_code,expected_amount_cents,position_id,investor_positions(display_name)").eq("offering_id", N);
  const by = (p: string) => ef.find((e: any) => e.investor_positions.display_name.startsWith(p));
  const DEP: [string, string | null, string, number, string][] = [
    ["northwind", "Northwind", "2026-02-10", 1_000_000, "exact"], ["cedar-1", "Cedar", "2026-02-11", 500_000, "multi 1/2"], ["cedar-2", "Cedar", "2026-02-14", 300_000, "multi 2/2"],
    ["atlas", "Atlas", "2026-02-13", 400_000, "partial"], ["kestrel", "Kestrel", "2026-02-20", 570_000, "late"], ["harbor", "Harbor", "2026-02-12", 400_000, "W-9 missing"],
    ["silverline", "Silverline", "2026-02-12", 400_000, "exact"], ["ada", "Ada", "2026-02-13", 300_050, "overpaid $50"], ["lena", "Lena", "2026-02-14", 200_000, "exact"],
    ["avery", "Avery", "2026-02-12", 20_000, "exact"], ["casey", null, "2026-02-14", 10_000, "no reference"],
  ];
  const target: Record<string, string> = {};
  for (const [k, who, on, amt, note] of DEP) {
    const e = who ? by(who) : null;
    const dedupe = `${BATCH}:dep:${k}`;
    const desc = e ? `WIRE IN ${who!.toUpperCase()} ${e.reference_code}` : "INCOMING WIRE";
    const { data: ex } = await d.from("bank_transactions").select("id").eq("dedupe_key", dedupe).maybeSingle();
    const row = ex ?? (await d.from("bank_transactions").insert({ offering_id: N, bank_account_id: acct.id, plaid_transaction_id: dedupe, dedupe_key: dedupe, posted_on: on, amount_cents: amt * 100, name: `DEMO ${note}`, description: desc, reference: e?.reference_code ?? null, direction: "inflow", currency: "USD" }).select("id").single()).data;
    target[row.id] = k;
  }
  await step("duplicate bank deposit refused", async () => { const r = await d.from("bank_transactions").insert({ offering_id: N, bank_account_id: acct.id, plaid_transaction_id: `${BATCH}:dep:northwind`, dedupe_key: `${BATCH}:dep:northwind`, posted_on: "2026-02-10", amount_cents: 100_000_000, direction: "inflow" }); if (r.error) throw new Error(r.error.message); return "inserted"; }, true);
  await step("detect", () => cc.detectFundingMatches(U.prep, N));
  await step("detect again (idempotent)", () => cc.detectFundingMatches(U.prep, N));
  const { data: ms } = await d.from("funding_matches").select("id,bank_transaction_id,expected_funding_id,status,exception_kind,confidence").eq("offering_id", N).in("bank_transaction_id", Object.keys(target));
  const m = (k: string) => ms.find((x: any) => target[x.bank_transaction_id] === k);
  console.log("proposals", JSON.stringify(ms.map((x: any) => [target[x.bank_transaction_id], x.status, x.confidence, x.exception_kind, !!x.expected_funding_id])));
  const pending = (x: any) => !["approved", "posted"].includes(x.status);
  // Negative tests
  if (pending(m("northwind"))) await step("wrong investor: Northwind cash -> Silverline", () => cc.decideFundingMatch(U.prep, { matchId: m("northwind").id, decision: "correct", expectedFundingId: by("Silverline").id, reason: "wrong-investor negative test" }), true);
  if (pending(m("casey"))) await step("Erik AML: apply cash to Erik while AML open", () => cc.decideFundingMatch(U.prep, { matchId: m("casey").id, decision: "correct", expectedFundingId: by("Erik").id, reason: "AML negative test" }), true);
  if (pending(m("ada"))) await step("$50 overpayment cannot enter capital", () => cc.decideFundingMatch(U.prep, { matchId: m("ada").id, decision: "approve" }), true);
  if (pending(m("atlas"))) await step("excess: apply more than the deposit", () => cc.decideFundingMatch(U.prep, { matchId: m("atlas").id, decision: "approve", amountCents: 60_000_000 }), true);
  const exp: Record<string, string> = { "cedar-1": "Cedar", "cedar-2": "Cedar", casey: "Casey" };
  for (const [k] of DEP) {
    if (k === "ada") continue;
    const x = m(k); if (!x || !pending(x)) continue;
    const want = by(exp[k] ?? DEP.find((r) => r[0] === k)![1]!).id;
    await step(`apply ${k}`, () => cc.decideFundingMatch(U.prep, x.expected_funding_id === want ? { matchId: x.id, decision: "approve" } : { matchId: x.id, decision: "correct", expectedFundingId: want, reason: k === "casey" ? "Manually identified: synthetic Casey Testtrust wire with no reference, amount equals call" : "Matched to the investor's reference" }));
  }
  await step("decide northwind twice", () => cc.decideFundingMatch(U.prep, { matchId: m("northwind").id, decision: "approve" }), true);
  const { data: ap } = await d.from("funding_matches").select("id,reconciliation_id,status,bank_transaction_id").eq("offering_id", N).in("bank_transaction_id", Object.keys(target)).in("status", ["approved"]);
  if (ap[0]) await step("journal preparer self-review", () => rc.advanceReconciliationJournal(U.prep, ap[0].reconciliation_id, "reviewed"), true);
  if (ap[0]) await step("decider cannot post", () => cc.postFundingMatch(U.prep, ap[0].id), true);
  for (const a of ap) { await step(`review+approve journal ${target[a.bank_transaction_id]}`, () => cc.postFundingMatch(U.rev, a.id)); await step(`post ${target[a.bank_transaction_id]}`, () => cc.postFundingMatch(U.appr, a.id)); }
  if (ap[0]) await step("post twice", () => cc.postFundingMatch(U.appr, ap[0].id), true);
} finally {
  for (const uid of Object.values(U)) await d.from("user_roles").delete().eq("user_id", uid).in("role", ["admin", "operations"]);
  appendFileSync("/tmp/wt/grants.jsonl", JSON.stringify({ revokedAt: new Date().toISOString() }) + "\n");
  console.log("temporary access removed");
}
