import { step, U, N, BATCH } from "./lib";
import { d, BOOK, grant, revoke, tb, bal, jeCount } from "./q1lib";
await grant();
try {
  const fa = await import("@/lib/fund-accounting.server");
  const src = (await d.from("fund_investment_transactions").select("id,status,idempotency_key,journal_entry_id").eq("journal_entry_id", "1f44e862-23bc-4592-9daa-fa991c019f2f").single()).data;
  const je = (await d.from("journal_entries").select("status,posted_at").eq("id", src.journal_entry_id).single()).data;
  console.log("DRAFT source", JSON.stringify(src), JSON.stringify(je));
  await step("posted entry cannot be voided", async () => { const { voidJournalEntry } = await import("@/lib/accounting.server"); return voidJournalEntry(U.rev, "252ace20-69cc-4eb1-95c8-d1f1658d043a", "negative test"); }, true);
  if (src.status === "rejected" && je.status === "draft") await step("void draft 1f44e862", () => fa.voidRejectedRecordDraft(U.rev, "fund_investment_transactions", src.id, `[${BATCH}] Draft of rejected negative-test duplicate (neg-dup2); never reviewed, approved or posted`));
  const ex = (await d.from("fund_expense_records").select("id,vendor,vendor_status").eq("offering_id", N)).data;
  for (const e of ex) if (e.vendor_status !== "unknown") await step(`vendor unknown: ${e.vendor}`, () => fa.setVendorProvenance(U.rev, { expenseId: e.id, status: "unknown", note: `[${BATCH}] Source scenario has no vendor; the vendor field holds the source description "${e.vendor}", not a verified counterparty.` }));
  const per = (await d.from("accounting_periods").select("*").eq("book_id", BOOK).eq("period_start", "2025-12-01").single()).data;
  const pev = (await d.from("accounting_period_events").select("id").eq("period_id", per.id)).data;
  if (!pev.length) await d.from("accounting_period_events").insert({ period_id: per.id, actor_user_id: U.appr, from_status: null, to_status: "locked", reason: `[${BATCH}] TEST FIXTURE: created directly as locked (outside the close workflow) on 2026-10-09 to prove locked-period refusal. No Dec-2025 period existed before; it replaced no historical close. Contains only the pre-existing opening entry.` });
  const inPer = (await d.from("journal_entries").select("id,status,memo").eq("period_id", per.id)).data;
  const dec = (await d.from("journal_entries").select("id,status,period_id").eq("book_id", BOOK).lte("entry_date", "2025-12-31")).data;
  console.log("DEC period", JSON.stringify({ per: [per.label, per.status, per.created_at], entriesLinked: inPer.length, decEntries: dec }));
  const t = await tb();
  const je2 = (await d.from("journal_entries").select("status").eq("book_id", BOOK)).data; const c: any = {}; je2.forEach((x: any) => c[x.status] = (c[x.status] ?? 0) + 1);
  console.log("TB", t.totalDebitCents, t.totalCreditCents, "JE", JSON.stringify(c), "cash", bal(t, "1000"), "2100", bal(t, "2100"));
  const val = (await d.from("fund_expense_records").select("paid_on,amount_cents,bank_line_id,bank_transaction_id,status").eq("offering_id", N).eq("category", "professional").single()).data;
  const apr = (await d.from("bank_transactions").select("id").eq("offering_id", N).gte("posted_on", "2026-04-01")).data;
  console.log("CHECK", JSON.stringify(val), "april bank items", apr.length);
} finally { await revoke(); }
