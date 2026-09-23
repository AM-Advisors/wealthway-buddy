import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** One month of money in and money out for a fund. */
export interface CashFlowPoint {
  /** YYYY-MM */
  period: string;
  contributions_cents: number;
  distributions_cents: number;
  net_cents: number;
  cumulative_contributions_cents: number;
  cumulative_distributions_cents: number;
}

export interface ValuationEntry {
  id: string;
  as_of_date: string;
  nav_cents: number;
  note: string;
}

export interface DistributionEntry {
  id: string;
  paid_on: string;
  amount_cents: number;
  kind: string;
  note: string;
}

export interface FundPerformance {
  offering_id: string;
  offering_name: string;
  reg_type: string | null;
  target_raise_cents: number | null;
  committed_cents: number;
  contributed_cents: number;
  distributed_cents: number;
  /** Latest recorded fund value; falls back to money received when none is set. */
  nav_cents: number;
  nav_is_estimate: boolean;
  nav_as_of: string | null;
  total_value_cents: number;
  gain_cents: number;
  /** Total return on money actually received, in percent. */
  return_pct: number | null;
  /** Money multiple (distributions + value) / contributions. */
  tvpi: number | null;
  dpi: number | null;
  rvpi: number | null;
  /** Annualised money-weighted return, in percent. Null when it cannot be solved. */
  irr_pct: number | null;
  /** Years between the first wire and today. */
  years_active: number | null;
  investors: number;
  first_contribution_at: string | null;
  last_activity_at: string | null;
  cash_flows: CashFlowPoint[];
  valuations: ValuationEntry[];
  distributions: DistributionEntry[];
  can_manage: boolean;
}

const EXCLUDED_STATUSES = new Set(["withdrawn", "declined", "rejected", "cancelled"]);
const DAY_MS = 24 * 60 * 60 * 1000;

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

/** Money-weighted return solved by bisection over dated cash flows. */
function xirr(flows: { when: number; amount: number }[]): number | null {
  if (flows.length < 2) return null;
  const positive = flows.some((f) => f.amount > 0);
  const negative = flows.some((f) => f.amount < 0);
  if (!positive || !negative) return null;

  const start = Math.min(...flows.map((f) => f.when));
  const npv = (rate: number) =>
    flows.reduce((sum, f) => {
      const years = (f.when - start) / (365 * DAY_MS);
      return sum + f.amount / Math.pow(1 + rate, years);
    }, 0);

  let low = -0.9999;
  let high = 10;
  let fLow = npv(low);
  let fHigh = npv(high);
  if (Number.isNaN(fLow) || Number.isNaN(fHigh) || fLow * fHigh > 0) return null;

  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    const fMid = npv(mid);
    if (!Number.isFinite(fMid)) return null;
    if (Math.abs(fMid) < 1e-6) return mid;
    if (fLow * fMid < 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return (low + high) / 2;
}

async function scopeFundIds(supabase: any, userId: string) {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");
  const isAdmin = (roles ?? []).length > 0;
  if (isAdmin) {
    const { data } = await supabase.from("offerings").select("id");
    return { isAdmin, ids: ((data ?? []) as any[]).map((o) => o.id as string) };
  }
  const { data } = await supabase.from("fund_managers").select("offering_id").eq("user_id", userId);
  return { isAdmin, ids: ((data ?? []) as any[]).map((m) => m.offering_id as string) };
}

async function assertCanManage(supabase: any, userId: string, offeringId: string) {
  const { ids, isAdmin } = await scopeFundIds(supabase, userId);
  if (!isAdmin && !ids.includes(offeringId)) {
    throw new Error("You do not have access to that fund.");
  }
}

/** Return, IRR and cash flow for every fund the viewer oversees. */
export const getFundPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { isAdmin, ids } = await scopeFundIds(supabase, userId);
    if (ids.length === 0) {
      return { isAdmin, funds: [] as FundPerformance[], totals: null };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: offerings }, { data: appsRaw }, { data: valuations }, { data: distributions }] =
      await Promise.all([
        supabaseAdmin
          .from("offerings")
          .select("id, name, reg_type, target_raise_cents")
          .in("id", ids),
        supabaseAdmin
          .from("investor_applications")
          .select("id, offering_id, status, funding_status, commitment_cents")
          .in("offering_id", ids),
        supabaseAdmin
          .from("fund_valuations")
          .select("id, offering_id, as_of_date, nav_cents, note")
          .in("offering_id", ids)
          .order("as_of_date", { ascending: false }),
        supabaseAdmin
          .from("fund_distributions")
          .select("id, offering_id, paid_on, amount_cents, kind, note")
          .in("offering_id", ids)
          .order("paid_on", { ascending: false }),
      ]);

    const apps = ((appsRaw ?? []) as any[]).filter((a) => !EXCLUDED_STATUSES.has(a.status));
    const appIds = apps.map((a) => a.id as string);
    const appFund = new Map<string, string>(apps.map((a) => [a.id as string, a.offering_id as string]));

    const { data: pays } = appIds.length
      ? await supabaseAdmin
          .from("payments")
          .select("application_id, amount_cents, status, confirmed_at, updated_at, created_at")
          .in("application_id", appIds)
      : { data: [] as any[] };

    const funds: FundPerformance[] = ((offerings ?? []) as any[])
      .map((offering) => {
        const fundApps = apps.filter((a) => a.offering_id === offering.id);
        const committed = fundApps.reduce((s, a) => s + Number(a.commitment_cents ?? 0), 0);

        const settled = ((pays ?? []) as any[]).filter(
          (p) => p.status === "settled" && appFund.get(p.application_id) === offering.id,
        );
        const contributions = settled.map((p) => ({
          when: new Date(p.confirmed_at ?? p.updated_at ?? p.created_at).getTime(),
          amount: Number(p.amount_cents ?? 0),
          application_id: p.application_id as string,
        }));
        const contributed = contributions.reduce((s, c) => s + c.amount, 0);

        const fundDistributions = ((distributions ?? []) as any[]).filter(
          (d) => d.offering_id === offering.id,
        );
        const distributed = fundDistributions.reduce((s, d) => s + Number(d.amount_cents ?? 0), 0);

        const fundValuations = ((valuations ?? []) as any[]).filter(
          (v) => v.offering_id === offering.id,
        );
        const latestValuation = fundValuations[0] ?? null;
        const navIsEstimate = !latestValuation;
        const nav = latestValuation
          ? Number(latestValuation.nav_cents ?? 0)
          : Math.max(contributed - distributed, 0);

        const totalValue = nav + distributed;
        const gain = totalValue - contributed;

        // Monthly cash flow series.
        const buckets = new Map<string, { contributions: number; distributions: number }>();
        for (const c of contributions) {
          const key = monthKey(new Date(c.when).toISOString());
          const row = buckets.get(key) ?? { contributions: 0, distributions: 0 };
          row.contributions += c.amount;
          buckets.set(key, row);
        }
        for (const d of fundDistributions) {
          const key = String(d.paid_on).slice(0, 7);
          const row = buckets.get(key) ?? { contributions: 0, distributions: 0 };
          row.distributions += Number(d.amount_cents ?? 0);
          buckets.set(key, row);
        }
        let runningIn = 0;
        let runningOut = 0;
        const cashFlows: CashFlowPoint[] = Array.from(buckets.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([period, row]) => {
            runningIn += row.contributions;
            runningOut += row.distributions;
            return {
              period,
              contributions_cents: row.contributions,
              distributions_cents: row.distributions,
              net_cents: row.distributions - row.contributions,
              cumulative_contributions_cents: runningIn,
              cumulative_distributions_cents: runningOut,
            };
          });

        // IRR: contributions are money out for the investor, distributions and
        // today's value are money back.
        const now = Date.now();
        const irrFlows = [
          ...contributions.map((c) => ({ when: c.when, amount: -c.amount })),
          ...fundDistributions.map((d) => ({
            when: new Date(`${String(d.paid_on)}T12:00:00Z`).getTime(),
            amount: Number(d.amount_cents ?? 0),
          })),
        ].filter((f) => Number.isFinite(f.when));
        if (contributions.length > 0) irrFlows.push({ when: now, amount: nav });
        const irr = xirr(irrFlows.sort((a, b) => a.when - b.when));

        const firstContribution = contributions.length
          ? new Date(Math.min(...contributions.map((c) => c.when))).toISOString()
          : null;
        const lastActivity = [
          ...contributions.map((c) => c.when),
          ...fundDistributions.map((d) => new Date(`${String(d.paid_on)}T12:00:00Z`).getTime()),
        ].sort((a, b) => b - a)[0];

        return {
          offering_id: offering.id as string,
          offering_name: offering.name as string,
          reg_type: (offering.reg_type ?? null) as string | null,
          target_raise_cents: (offering.target_raise_cents ?? null) as number | null,
          committed_cents: committed,
          contributed_cents: contributed,
          distributed_cents: distributed,
          nav_cents: nav,
          nav_is_estimate: navIsEstimate,
          nav_as_of: latestValuation ? String(latestValuation.as_of_date) : null,
          total_value_cents: totalValue,
          gain_cents: gain,
          return_pct:
            contributed > 0 ? Math.round((gain / contributed) * 10000) / 100 : null,
          tvpi: contributed > 0 ? Math.round((totalValue / contributed) * 100) / 100 : null,
          dpi: contributed > 0 ? Math.round((distributed / contributed) * 100) / 100 : null,
          rvpi: contributed > 0 ? Math.round((nav / contributed) * 100) / 100 : null,
          irr_pct: irr == null ? null : Math.round(irr * 10000) / 100,
          years_active: firstContribution
            ? Math.round(((now - new Date(firstContribution).getTime()) / (365 * DAY_MS)) * 10) / 10
            : null,
          investors: new Set(contributions.map((c) => c.application_id)).size,
          first_contribution_at: firstContribution,
          last_activity_at: lastActivity ? new Date(lastActivity).toISOString() : null,
          cash_flows: cashFlows,
          valuations: fundValuations.map((v) => ({
            id: v.id as string,
            as_of_date: String(v.as_of_date),
            nav_cents: Number(v.nav_cents ?? 0),
            note: String(v.note ?? ""),
          })),
          distributions: fundDistributions.map((d) => ({
            id: d.id as string,
            paid_on: String(d.paid_on),
            amount_cents: Number(d.amount_cents ?? 0),
            kind: String(d.kind ?? "distribution"),
            note: String(d.note ?? ""),
          })),
          can_manage: true,
        } satisfies FundPerformance;
      })
      .sort(
        (a, b) => b.total_value_cents - a.total_value_cents ||
          a.offering_name.localeCompare(b.offering_name),
      );

    const totals = {
      contributed_cents: funds.reduce((s, f) => s + f.contributed_cents, 0),
      distributed_cents: funds.reduce((s, f) => s + f.distributed_cents, 0),
      nav_cents: funds.reduce((s, f) => s + f.nav_cents, 0),
      committed_cents: funds.reduce((s, f) => s + f.committed_cents, 0),
      investors: funds.reduce((s, f) => s + f.investors, 0),
    };

    return { isAdmin, funds, totals };
  });

const valuationSchema = z.object({
  offering_id: z.string().uuid(),
  as_of_date: z.string().min(8).max(10),
  nav_cents: z.number().int().min(0),
  note: z.string().trim().max(300).default(""),
});

/** Record (or update) what the fund is worth on a date. */
export const saveFundValuation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => valuationSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, context.userId, data.offering_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("fund_valuations").upsert(
      {
        offering_id: data.offering_id,
        as_of_date: data.as_of_date,
        nav_cents: data.nav_cents,
        note: data.note,
        created_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "offering_id,as_of_date" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Record money paid back out to investors. */
export const saveFundDistribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        paid_on: z.string().min(8).max(10),
        amount_cents: z.number().int().min(1),
        kind: z.string().trim().min(1).max(40).default("distribution"),
        note: z.string().trim().max(300).default(""),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, context.userId, data.offering_id);
    // D1: fund distributions are generated only by the distribution engine
    // after bank reconciliation and posted accounting.
    throw new Error(
      "Distributions are recorded automatically once Harmonious reconciles the bank payment and posts the accounting.",
    );
  });

/** Remove a valuation or distribution entry. */
export const removePerformanceEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        id: z.string().uuid(),
        kind: z.enum(["valuation", "distribution"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, context.userId, data.offering_id);
    if (data.kind === "distribution") {
      throw new Error("Distribution history is permanent and cannot be removed.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = "fund_valuations";
    const { error } = await supabaseAdmin
      .from(table)
      .delete()
      .eq("id", data.id)
      .eq("offering_id", data.offering_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
