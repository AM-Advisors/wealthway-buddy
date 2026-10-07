import { N, U, step, db } from "./lib";
const rc = await import("@/lib/reconciliation.server");
const d = await db();
const { data } = await d.from("bank_reconciliations").select("id,transaction_type,bank_transactions!inner(direction)").eq("offering_id", N).eq("bank_transactions.direction", "outbound");
for (const r of data ?? []) {
  const t = r.transaction_type;
  await step(`${t}: Harmonious review approve (reviewer)`, () => rc.reviewReconciliation(U.rev, { reconciliationId: r.id, action: "approve" }));
  const rec = (await d.from("bank_reconciliations").select("*").eq("id", r.id).single()).data;
  if (rec.acknowledgement_required && !rec.acknowledged_at) await step(`${t}: manager acknowledge`, () => rc.externalApproveReconciliation(U.mgr, { reconciliationId: r.id, decision: "approve" }));
  const r2 = (await d.from("bank_reconciliations").select("journal_entry_id").eq("id", r.id).single()).data;
  if (!r2.journal_entry_id) await step(`${t}: prepare journal (preparer)`, () => rc.prepareReconciliationJournal(U.prep, r.id));
  await step(`${t}: journal reviewed (reviewer)`, () => rc.advanceReconciliationJournal(U.rev, r.id, "reviewed"));
  await step(`${t}: journal approved (approver)`, () => rc.advanceReconciliationJournal(U.appr, r.id, "approved"));
  await step(`${t}: approver cannot also post`, () => rc.advanceReconciliationJournal(U.appr, r.id, "posted"), true);
  await step(`${t}: journal posted (preparer)`, () => rc.advanceReconciliationJournal(U.prep, r.id, "posted"));
}
