import { step, U, N, BATCH } from "./lib";
import { d, BOOK, grant, revoke, tb, bal, jeCount } from "./q1lib";
await grant();
try {
  const rc = await import("@/lib/reconciliation.server");
  const keys: [string, string, string][] = [["inv-northstar", "1100", "portfolio_investment"], ["inv-brightline", "1100", "portfolio_investment"], ["inv-gridwise-fo", "1100", "portfolio_investment"], ["exp-legal", "5210", "fund_expense"], ["exp-admin", "5250", "fund_expense"]];
  const t0 = await tb(); const j0 = await jeCount();
  await step("re-classify bank feed", () => rc.classifyFundCash(U.prep, N));
  const out: any[] = [];
  for (const [k, dr, type] of keys) {
    const txId = (await d.from("bank_transactions").select("id").eq("dedupe_key", `${BATCH}:out:${k}`).single()).data.id;
    let rec = (await d.from("bank_reconciliations").select("*").eq("bank_transaction_id", txId).single()).data;
    // Exceptions raised before linked records were recognised: close them with the reason.
    const ex = (await d.from("accounting_exceptions").select("id,kind").eq("bank_transaction_id", txId).eq("status", "open")).data;
    for (const e of ex) await step(`resolve ${e.kind} ${k}`, () => rc.resolveException(U.rev, e.id, "resolved", `Explained by linked posted fund accounting record; classification defect fixed (${BATCH}).`));
    if (rec.status === "auto_matched") await step(`review ${k}`, () => rc.reviewReconciliation(U.rev, { reconciliationId: rec.id, action: "approve", reason: "Matches linked posted DEMO record", correction: { transactionType: type as any, debitAccountCode: dr, creditAccountCode: "1000" } }));
    rec = (await d.from("bank_reconciliations").select("*").eq("id", rec.id).single()).data;
    if (rec.status === "harmonious_reviewed") await step(`second approval ${k} (${rec.approval_required})`, () => rc.externalApproveReconciliation(U.appr, { reconciliationId: rec.id, decision: "approve" }));
    const r: any = await step(`reconciliation journal ${k}`, () => rc.prepareReconciliationJournal(U.rev, rec.id));
    const recJe = (await d.from("bank_reconciliations").select("journal_entry_id,status").eq("id", rec.id).single()).data;
    const link = (await d.from("fund_investment_transactions").select("journal_entry_id").eq("bank_transaction_id", txId).maybeSingle()).data ?? (await d.from("fund_expense_records").select("journal_entry_id").eq("bank_transaction_id", txId).maybeSingle()).data;
    out.push({ k, recStatus: recJe.status, reused: recJe.journal_entry_id === link?.journal_entry_id, je: recJe.journal_entry_id, linked: r?.linkedRecord?.table });
  }
  console.log("RECON", JSON.stringify(out));
  const t1 = await tb();
  console.log("NO-DOUBLE", JSON.stringify({ jeBefore: j0, jeAfter: await jeCount(), cashBefore: bal(t0, "1000"), cashAfter: bal(t1, "1000") }));
  const open = (await d.from("accounting_exceptions").select("kind,status,bank_transaction_id").eq("offering_id", N).eq("status", "open")).data;
  console.log("OPEN-EXC", JSON.stringify(open));
} finally { await revoke(); }
