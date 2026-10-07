import { N, U, step, db } from "./lib";
const ds = await import("@/lib/distributions.server");
const B = "a50204b1-aa68-469b-a95e-1d75b8fceaa3";
const d = await db();
const BA = (await d.from("bank_accounts").select("id").eq("offering_id", N).single()).data.id;
const { data: lines } = await d.from("distribution_lines").select("id,display_name,investor_user_id,net_cents").eq("batch_id", B);
for (const l of lines ?? []) {
  const nm = l.display_name;
  const chk: any = await step(`${nm}: execution check`, () => ds.distributionExecutionCheck(U.prep, l.id));
  if ((chk?.blockers ?? []).length) await step(`${nm}: investor confirms destination`, () => ds.investorConfirmDistribution(l.investor_user_id, l.id));
  const ref = `QA3-DIST1-${nm.slice(-1)}`;
  const pay: any = await step(`${nm}: record manually initiated transfer (QA treasury, separate person; app sends no money)`, () => ds.executeDistributionPayment(U.rev, { lineId: l.id, provider: "manual_bank", externalReference: ref }));
  const pid = pay?.paymentId ?? pay?.id ?? pay?.payment?.id;
  const tx = await step(`${nm}: simulated bank outflow ${l.net_cents}`, async () => (await d.from("bank_transactions").insert({ offering_id: N, bank_account_id: BA, plaid_transaction_id: `qa3-${ref}`, dedupe_key: `qa3-${ref}`, posted_on: "2026-08-28", amount_cents: -Number(l.net_cents), name: `[QA] Distribution wire to ${nm}`, description: ref, reference: ref, direction: "outbound", currency: "USD" }).select("id").single()).data) as any;
  await step(`${nm}: reconcile payment to bank line (approver)`, () => ds.reconcileDistributionPayment(U.appr, { paymentId: pid, bankTransactionId: tx.id }));
  await step(`${nm}: reviewer cannot approve own reconciliation`, () => ds.approveDistributionReconciliation(U.appr, pid), true);
  await step(`${nm}: approve reconciliation (preparer, independent of reconciler)`, () => ds.approveDistributionReconciliation(U.prep, pid));
  await step(`${nm}: post payment to books (preparer)`, () => ds.postDistributionPayment(U.prep, pid));
}
console.log("BATCH", JSON.stringify((await d.from("distribution_batches").select("status").eq("id", B).single()).data));
