import { step, U, N, BATCH } from "./lib";
import { d, BOOK, grant, revoke, tb, bal, jeCount } from "./q1lib";
await grant();
try {
  const fa = await import("@/lib/fund-accounting.server");
  const { advanceJournalEntry } = await import("@/lib/accounting.server");
  // Blake facts
  const pos = (await d.from("investor_positions").select("id,display_name,status,person_id,notes").ilike("display_name", "Blake%").eq("offering_id", N).single()).data;
  const ob = (await d.from("investor_onboardings").select("*").eq("offering_id", N).eq("person_id", pos.person_id).maybeSingle()).data;
  const blakeTx = (await d.from("bank_transactions").select("id").eq("offering_id", N).ilike("name", "%BLAKE%")).data;
  const fm = (await d.from("funding_matches").select("status").eq("offering_id", N).eq("position_id", pos.id)).data;
  console.log("BLAKE", JSON.stringify({ pos: [pos.status], ob: ob ? Object.fromEntries(Object.entries(ob).filter(([k]) => /state|status|kyc|aml|hold|block/i.test(k))) : null, bankTx: blakeTx.length, matches: fm }));
  // Fee mappings
  for (const [p, c] of [["management_fee_expense", "5000"], ["management_fee_payable", "2200"]]) {
    const id = (await d.from("chart_of_accounts").select("id").eq("book_id", BOOK).eq("code", c).single()).data.id;
    const m = (await d.from("fund_account_mappings").select("account_id").eq("book_id", BOOK).eq("purpose", p).eq("active", true)).data;
    if (m?.[0]?.account_id !== id) await step(`map ${p} -> ${c}`, () => fa.setMapping(U.prep, { offeringId: N, purpose: p, accountId: id, note: "DEMO Walkthrough chart mapping" }));
  }
  // Independent benchmark: class A 2.00%, class B 1.50% on committed capital, quarterly (1/4)
  const ps = (await d.from("investor_positions").select("id,display_name,class_id,status").eq("offering_id", N)).data;
  const cls = (await d.from("investor_classes").select("id,name").eq("offering_id", N)).data ?? [];
  const ev = (await d.from("commitment_events").select("position_id,event_type,amount_cents").eq("offering_id", N)).data;
  let bench = 0; const indep: any[] = [];
  for (const p of ps.filter((x: any) => x.status === "active")) {
    const c = ev.filter((e: any) => e.position_id === p.id && e.event_type === "original_commitment").reduce((s: number, e: any) => s + Number(e.amount_cents), 0);
    const cn = cls.find((k: any) => k.id === p.class_id)?.name ?? "?";
    const bps = /A/.test(cn) ? 200 : 150; const fee = Math.round(c * bps / 10000 / 4);
    bench += fee; indep.push([p.display_name, cn, c, bps, fee]);
  }
  console.log("INDEP", bench, JSON.stringify(indep));
  await step("mismatched benchmark stops", () => fa.prepareFeeAccrual(U.prep, { offeringId: N, start: "2026-01-01", end: "2026-03-31", benchmarkCents: 10_918_750 }), true);
  const memo = "Management fee accrual 2026-01-01..2026-03-31";
  let je = (await d.from("journal_entries").select("id,status").eq("book_id", BOOK).eq("memo", memo).not("status", "in", "(voided,reversed)").maybeSingle()).data;
  if (!je) { const r: any = await step("prepare fee accrual", () => fa.prepareFeeAccrual(U.prep, { offeringId: N, start: "2026-01-01", end: "2026-03-31", benchmarkCents: 11_543_750 })); je = { id: r.entryId, status: "draft" }; console.log("ENGINE LINES", JSON.stringify(r.lines.map((l: any) => [l.name, l.appliedLevel, l.effectiveRateBps, l.netFeeCents]))); }
  await step("duplicate accrual refused", () => fa.prepareFeeAccrual(U.prep, { offeringId: N, start: "2026-01-01", end: "2026-03-31", benchmarkCents: 11_543_750 }), true);
  const s = async () => (await d.from("journal_entries").select("status").eq("id", je.id).single()).data.status;
  if (await s() === "draft") await step("preparer self-review refused", () => advanceJournalEntry(U.prep, je.id, "reviewed"), true);
  if (await s() === "draft") await step("review accrual", () => advanceJournalEntry(U.rev, je.id, "reviewed"));
  if (await s() === "reviewed") await step("approve accrual", () => advanceJournalEntry(U.rev, je.id, "approved"));
  if (await s() === "approved") await step("approver cannot post", () => advanceJournalEntry(U.rev, je.id, "posted"), true);
  if (await s() === "approved") await step("post accrual", () => advanceJournalEntry(U.appr, je.id, "posted"));
  const t = await tb();
  console.log("BAL", JSON.stringify({ je: await jeCount(), id: je.id, cash: bal(t, "1000"), e5000: bal(t, "5000"), p2200: bal(t, "2200"), a2100: bal(t, "2100"), dr: t.totalDebitCents, cr: t.totalCreditCents }));
  console.log("ROWS", JSON.stringify(t.rows.map((r: any) => [r.code, r.balanceCents])));
  const assets = (await d.from("portfolio_assets").select("id,issuer_name,cost_basis_cents").eq("offering_id", N)).data;
  const vals = (await d.from("portfolio_valuations").select("asset_id,status,value_cents,valuation_date").eq("offering_id", N)).data;
  console.log("HOLD", JSON.stringify(assets.map((a: any) => [a.issuer_name, a.cost_basis_cents, vals.filter((v: any) => v.asset_id === a.id).map((v: any) => [v.status, v.value_cents, v.valuation_date])])));
} finally { await revoke(); }
