import { N, U, step, db } from "./lib";
const ds = await import("@/lib/distributions.server");
const B = "a50204b1-aa68-469b-a95e-1d75b8fceaa3";
const d = await db();
const BA = (await d.from("bank_accounts").select("id").eq("offering_id", N).single()).data.id;
const { data: lines } = await d.from("distribution_lines").select("id,display_name,net_cents").eq("batch_id", B);
for (const l of lines ?? []) {
  const nm = l.display_name; const ref = `QA3-DIST1-${nm.slice(-1)}`;
  let p = (await d.from("distribution_payments").select("id").eq("distribution_line_id", l.id).maybeSingle()).data as any;
  if (!p) { const r: any = await step(`${nm}: record manually initiated transfer (reviewer w/ finance; app sends no money)`, () => ds.executeDistributionPayment(U.rev, { lineId: l.id, provider: "manual_bank", externalReference: ref })); p = { id: r.paymentId }; }
  // QA time compression only: scenario send date is 2026-08-28; the run happens later.
  await d.from("distribution_payments").update({ submitted_at: "2026-08-28T15:00:00Z" }).eq("id", p.id);
  let tx = (await d.from("bank_transactions").select("id").eq("dedupe_key", `qa3-${ref}`).maybeSingle()).data as any;
  if (!tx) tx = (await d.from("bank_transactions").insert({ offering_id: N, bank_account_id: BA, plaid_transaction_id: `qa3-${ref}`, dedupe_key: `qa3-${ref}`, posted_on: "2026-08-28", amount_cents: -Number(l.net_cents), name: `[QA] Distribution wire to ${nm}`, description: ref, reference: ref, direction: "outbound", currency: "USD" }).select("id").single()).data;
  const rc = (await d.from("distribution_payments").select("reconciled_at,posted_at").eq("id", p.id).single()).data as any;
  if (!rc.reconciled_at) await step(`${nm}: reconcile payment to bank line (approver)`, () => ds.reconcileDistributionPayment(U.appr, { paymentId: p.id, bankTransactionId: tx.id }));
  if (!rc.reconciled_at) await step(`${nm}: reconciler cannot approve own reconciliation`, () => ds.approveDistributionReconciliation(U.appr, p.id), true);
  if (!rc.reconciled_at) await step(`${nm}: approve reconciliation (preparer)`, () => ds.approveDistributionReconciliation(U.prep, p.id));
  await step(`${nm}: post payment to books (approver)`, () => ds.postDistributionPayment(U.appr, p.id));
}
console.log("BATCH", JSON.stringify((await d.from("distribution_batches").select("status").eq("id", B).single()).data));
