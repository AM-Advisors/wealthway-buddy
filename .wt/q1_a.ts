import { step, U, N, BATCH } from "./lib";
import { d, BOOK, grant, revoke, tb, bal, jeCount } from "./q1lib";
import { NEW_INVESTMENTS, EXPENSES } from "@/lib/reference-fund/walkthrough-period";
await grant();
try {
  const fa = await import("@/lib/fund-accounting.server");
  const t0 = await tb();
  const fee: any = await fa.feePreview(U.prep, N, { start: "2026-01-01", end: "2026-03-31" });
  console.log("START", JSON.stringify({ je: await jeCount(), cost: bal(t0, "1100"), unreal: bal(t0, "1110"), acc: bal(t0, "2100"), cred: bal(t0, "2500"), paidIn: bal(t0, "3000") + bal(t0, "3100"), cash: bal(t0, "1000"), dr: t0.totalDebitCents, cr: t0.totalCreditCents, fee: fee.totalNetCents }));
  // Synthetic bank feed movements from the source scenario (wire-outs + cleared paid expenses).
  const moves: [string, string, number, string][] = [
    ...NEW_INVESTMENTS.map((i) => [`out:${i.id}`, i.date, i.costCents, `WIRE OUT ${i.name}`] as [string, string, number, string]),
    ...EXPENSES.filter((e) => e.paid && e.id !== "exp-valuation" && e.id !== "exp-bank").map((e) => [`out:${e.id}`, e.date, e.amountCents, `DEMO ${e.description}`] as [string, string, number, string]),
  ];
  const tx: Record<string, string> = {};
  for (const [k, on, amt, name] of moves) {
    const key = `${BATCH}:${k}`;
    const ex = (await d.from("bank_transactions").select("id").eq("dedupe_key", key).maybeSingle()).data;
    tx[k] = ex?.id ?? (await d.from("bank_transactions").insert({ offering_id: N, plaid_transaction_id: key, dedupe_key: key, posted_on: on, amount_cents: -amt, name, description: name, direction: "outbound", currency: "USD" }).select("id").single()).data.id;
  }
  console.log("BANKTX", JSON.stringify(tx));
  const assets = (await d.from("portfolio_assets").select("id,issuer_name,asset_name").eq("offering_id", N)).data;
  const gridwise = assets.find((a: any) => a.issuer_name.startsWith("Gridwise"));
  const other = (await d.from("bank_transactions").select("id,offering_id").neq("offering_id", N).eq("direction", "outbound").limit(1)).data[0];
  const base = (i: any) => ({ offeringId: N, tradeDate: i.date, settlementDate: i.date, quantity: null, unitPriceCents: null, principalCents: i.costCents, transactionCostCents: 0, sourceReference: `[${BATCH}] ${i.evidence}`, evidenceReference: i.evidence, newAssetClass: i.assetClass, instrument: i.name.match(/\((.*)\)/)?.[1] ?? null, bankLineId: null });
  const spec = (i: any) => i.followOnOf
    ? { ...base(i), kind: "additional_purchase" as const, assetId: gridwise.id, newIssuerName: null, newAssetName: null, idempotencyKey: `${BATCH}:${i.id}` }
    : { ...base(i), kind: "purchase" as const, assetId: null, newIssuerName: i.name.split(" (")[0], newAssetName: i.name.match(/\((.*)\)/)[1], idempotencyKey: `${BATCH}:${i.id}` };
  const first = NEW_INVESTMENTS[0];
  // Negative tests before anything exists for these movements.
  await step("wrong amount refused", () => fa.prepareInvestment(U.prep, { ...spec(first), idempotencyKey: "neg-amt", principalCents: first.costCents + 100, bankTransactionId: tx[`out:${first.id}`] }), true);
  const inflow = (await d.from("bank_transactions").select("id").eq("offering_id", N).eq("direction", "inflow").limit(1)).data[0].id;
  await step("wrong sign (inflow) refused", () => fa.prepareInvestment(U.prep, { ...spec(first), idempotencyKey: "neg-sign", bankTransactionId: inflow }), true);
  await step("cross-fund bank tx refused", () => fa.prepareInvestment(U.prep, { ...spec(first), idempotencyKey: "neg-xfund", bankTransactionId: other.id }), true);
  await step("unauthorized user refused", () => fa.prepareInvestment("00000000-0000-4000-8000-000000000001", { ...spec(first), idempotencyKey: "neg-auth", bankTransactionId: tx[`out:${first.id}`] }), true);
  const ids: Record<string, string> = {};
  for (const i of NEW_INVESTMENTS) {
    const r: any = await step(`prepare ${i.id}`, () => fa.prepareInvestment(U.prep, { ...spec(i), bankTransactionId: tx[`out:${i.id}`] }));
    ids[i.id] = r.id;
  }
  const dup: any = await step("duplicate purchase (same key) -> returns existing, no new record", () => fa.prepareInvestment(U.prep, { ...spec(first), bankTransactionId: tx[`out:${first.id}`] }));
  if (!dup?.duplicate) throw new Error("duplicate not detected");
  await step("duplicate purchase (new key, same security) refused", () => fa.prepareInvestment(U.prep, { ...spec(first), idempotencyKey: "neg-dup2", bankTransactionId: null }), true);
  await step("duplicate bank link refused", () => fa.prepareExpense(U.prep, { offeringId: N, category: "legal", vendor: "DEMO dup", description: "dup", invoiceNumber: "DUP-LINK", invoiceDate: null, serviceStart: null, serviceEnd: null, expenseDate: first.date, amountCents: first.costCents, paymentMode: "paid", paidOn: first.date, sourceReference: "neg", evidenceReference: null, bankLineId: null, bankTransactionId: tx[`out:${first.id}`] }), true);
  const ji = ids[first.id];
  await step("self-approval refused", () => fa.decideInvestment(U.prep, ji, true, null), true);
  for (const i of NEW_INVESTMENTS) await step(`approve ${i.id} (reviewer)`, () => fa.decideInvestment(U.rev, ids[i.id], true, "DEMO evidence checked"));
  await step("approver cannot post", () => fa.postInvestment(U.rev, ji), true);
  await step("unauthorized posting refused", () => fa.postInvestment("00000000-0000-4000-8000-000000000001", ji), true);
  for (const i of NEW_INVESTMENTS) await step(`post ${i.id} (poster)`, () => fa.postInvestment(U.appr, ids[i.id]));
  await step("post twice refused", () => fa.postInvestment(U.appr, ji), true);
  // Locked period: Dec 2025 (pre-takeover) is sealed; a purchase dated into it must be refused.
  let per = (await d.from("accounting_periods").select("id,status").eq("book_id", BOOK).eq("period_start", "2025-12-01").maybeSingle()).data;
  if (!per) per = (await d.from("accounting_periods").insert({ book_id: BOOK, label: "Dec 2025 (pre-takeover, sealed)", period_start: "2025-12-01", period_end: "2025-12-31", status: "locked", locked_at: new Date().toISOString(), locked_by: U.appr }).select("id,status").single()).data;
  console.log("PERIOD", JSON.stringify(per));
  await step("purchase into locked period refused", () => fa.prepareInvestment(U.prep, { ...spec(first), kind: "purchase", newIssuerName: "DEMO Locked Probe", newAssetName: "Common", tradeDate: "2025-12-15", settlementDate: "2025-12-15", idempotencyKey: "neg-locked", bankTransactionId: null }), true);
  const left = (await d.from("fund_investment_transactions").select("id,status,idempotency_key").eq("offering_id", N)).data;
  console.log("INVTX", JSON.stringify(left));
  const t1 = await tb();
  console.log("AFTER", JSON.stringify({ je: await jeCount(), cost: bal(t1, "1100"), cash: bal(t1, "1000"), dr: t1.totalDebitCents, cr: t1.totalCreditCents }));
} finally { await revoke(); }
