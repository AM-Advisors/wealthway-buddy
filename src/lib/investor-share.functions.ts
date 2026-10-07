import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { rollByYear, summarize, tieToK1, toPeriod, type K1Lite } from "@/lib/investor-share-model";

/** Only released records ever feed this view. */
const APPROVED_CA = ["published"];

/**
 * Capital accounts investors may see: those marked published, plus finalized
 * ("approved") accounts whose investor statement has been published. The
 * allocation engine releases accounts through published statements and never
 * sets a "published" status on the account itself.
 */
async function releasedCapitalAccounts(d: any, offeringId: string, f: { investorUserId?: string; periodEnd?: string; columns?: string } = {}) {
  const cols = f.columns ?? "*";
  let pub = d.from("capital_accounts").select(cols).eq("offering_id", offeringId).in("status", APPROVED_CA);
  let st = d.from("investor_statements").select("capital_account_id").eq("offering_id", offeringId).eq("status", "published").not("capital_account_id", "is", null);
  if (f.investorUserId) { pub = pub.eq("investor_user_id", f.investorUserId); st = st.eq("investor_user_id", f.investorUserId); }
  if (f.periodEnd) pub = pub.eq("period_end", f.periodEnd);
  const [{ data: a }, { data: s }] = await Promise.all([pub, st]);
  const rows = [...((a ?? []) as any[])];
  const ids = [...new Set(((s ?? []) as any[]).map((r) => String(r.capital_account_id)))];
  if (ids.length) {
    let q = d.from("capital_accounts").select(cols).in("id", ids).eq("status", "approved");
    if (f.periodEnd) q = q.eq("period_end", f.periodEnd);
    const { data: b } = await q;
    rows.push(...((b ?? []) as any[]));
  }
  return { data: rows };
}
const FINAL_K1 = ["final", "delivered"];

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

function build(caRows: any[], k1Rows: any[]) {
  const periods = caRows.map(toPeriod);
  const years = rollByYear(periods);
  const k1s: K1Lite[] = k1Rows.map((k) => ({ year: Number(k.tax_year), boxes: k.boxes ?? {}, taxCapital: k.tax_capital ?? null }));
  return {
    summary: summarize(periods),
    periods,
    years,
    ties: years.map((y) => tieToK1(y, k1s.find((k) => k.year === y.year))),
  };
}

/** The signed-in investor's (or cap-table holder's) own share of one fund. */
export const investorShareFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const d = await db();
    const uid = context.userId;
    const [{ data: ca }, { data: k1 }, { data: off }] = await Promise.all([
      releasedCapitalAccounts(d, data.offeringId, { investorUserId: uid }),
      d.from("k1_forms").select("tax_year, boxes, tax_capital, status").eq("offering_id", data.offeringId).eq("investor_user_id", uid).in("status", FINAL_K1),
      d.from("offerings").select("id, client_id, entity_type").eq("id", data.offeringId).maybeSingle(),
    ]);
    const mine = build((ca ?? []) as any[], (k1 ?? []) as any[]);

    // Fund's approved net assets for the latest period this investor has (aggregate only; no other investor detail).
    let fundNetAssets: number | null = null;
    const asOf = mine.summary.asOf;
    if (asOf && off) {
      const { data: all } = await releasedCapitalAccounts(d, data.offeringId, { periodEnd: asOf, columns: "id, ending_capital_cents" });
      fundNetAssets = ((all ?? []) as any[]).reduce((s, r) => s + Number(r.ending_capital_cents ?? 0), 0);
    }
    const entityType = String((off as any)?.entity_type ?? "").toLowerCase();
    const isCorporation = /corp|inc/.test(entityType) && !/llc|partnership|lp/.test(entityType);
    return { ...mine, fundNetAssets, isCorporation };
  });

/** Harmonious / fund managers: every investor's K-1 tie status for a fund. Read-only. */
export const capitalTieReportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { assertFund } = await import("@/lib/fund-tabs.server");
    await assertFund(context.userId, data.offeringId);
    const d = await db();
    const [{ data: ca }, { data: k1 }] = await Promise.all([
      releasedCapitalAccounts(d, data.offeringId),
      d.from("k1_forms").select("investor_user_id, tax_year, boxes, tax_capital, status").eq("offering_id", data.offeringId).in("status", FINAL_K1),
    ]);
    const byInvestor = new Map<string, any[]>();
    for (const r of (ca ?? []) as any[]) {
      if (!r.investor_user_id) continue;
      byInvestor.set(r.investor_user_id, [...(byInvestor.get(r.investor_user_id) ?? []), r]);
    }
    const ids = [...byInvestor.keys()];
    const { data: profs } = ids.length ? await d.from("profiles").select("user_id, legal_name, email").in("user_id", ids) : { data: [] };
    return ids.map((id) => {
      const b = build(byInvestor.get(id)!, ((k1 ?? []) as any[]).filter((k) => k.investor_user_id === id));
      const p = ((profs ?? []) as any[]).find((x) => x.user_id === id);
      return { investorUserId: id, name: p?.legal_name || p?.email || "Investor", balance: b.summary.balance, ties: b.ties };
    });
  });
