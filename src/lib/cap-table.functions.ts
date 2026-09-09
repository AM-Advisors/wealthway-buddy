import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** One investor's position in a fund, derived from live commitments. */
export interface CapTableHolder {
  application_id: string;
  name: string;
  is_you: boolean;
  investor_type: string | null;
  entity_name: string | null;
  commitment_cents: number;
  funded_cents: number;
  /** Units/interests recorded by the fund team, when they track shares. */
  shares: number | null;
  share_class: string;
  /** Share of everything committed so far. */
  pct_of_committed: number;
  /** Share of money actually received so far. */
  pct_of_funded: number;
  /** Share of the fund's target raise. */
  pct_of_target: number;
  status: string;
  funding_status: string | null;
  committed_at: string;
}

export interface FundCapTable {
  offering_id: string;
  offering_name: string;
  reg_type: string | null;
  target_raise_cents: number | null;
  total_committed_cents: number;
  total_funded_cents: number;
  total_shares: number;
  holder_count: number;
  /** Empty for investors who are not allowed to see other holders. */
  holders: CapTableHolder[];
  you: CapTableHolder | null;
  can_manage: boolean;
  /** True when the viewer may see who the other holders are. */
  names_visible: boolean;
  updated_at: string | null;
}

type AppRow = {
  id: string;
  user_id: string;
  offering_id: string;
  status: string;
  funding_status: string | null;
  commitment_cents: number | null;
  created_at: string;
  updated_at: string | null;
};

const EXCLUDED_STATUSES = new Set(["withdrawn", "declined", "rejected", "cancelled"]);

function pct(part: number, whole: number) {
  if (!whole || whole <= 0) return 0;
  return Math.round((part / whole) * 1_000_000) / 10_000; // 4 decimals
}

/**
 * Builds the live cap table for one fund out of applications, confirmed
 * subscriptions and settled payments. Reads fund-wide rows with the admin
 * client because an investor may only read their own rows under RLS — the
 * caller's access is verified first and other holders stay anonymous unless
 * the manager has switched cap table visibility on for them.
 */
async function buildCapTable(
  offeringId: string,
  viewerId: string,
  canManage: boolean,
  namesVisible: boolean,
): Promise<FundCapTable> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: offering } = await supabaseAdmin
    .from("offerings")
    .select("id, name, reg_type, target_raise_cents")
    .eq("id", offeringId)
    .maybeSingle();
  if (!offering) throw new Error("That fund is not available.");

  const { data: appsRaw, error } = await supabaseAdmin
    .from("investor_applications")
    .select("id, user_id, offering_id, status, funding_status, commitment_cents, created_at, updated_at")
    .eq("offering_id", offeringId);
  if (error) throw new Error(error.message);

  const apps = ((appsRaw ?? []) as AppRow[]).filter((a) => !EXCLUDED_STATUSES.has(a.status));
  const appIds = apps.map((a) => a.id);

  const [{ data: subs }, { data: pays }, { data: profiles }, { data: positions }] =
    await Promise.all([
      appIds.length
        ? supabaseAdmin
            .from("subscriptions")
            .select("application_id, commitment_cents, status")
            .in("application_id", appIds)
        : Promise.resolve({ data: [] as any[] }),
      appIds.length
        ? supabaseAdmin
            .from("payments")
            .select("application_id, amount_cents, status")
            .in("application_id", appIds)
        : Promise.resolve({ data: [] as any[] }),
      apps.length
        ? supabaseAdmin
            .from("profiles")
            .select("user_id, legal_name, entity_name, investor_type")
            .in("user_id", Array.from(new Set(apps.map((a) => a.user_id))))
        : Promise.resolve({ data: [] as any[] }),
      supabaseAdmin
        .from("investor_cap_positions")
        .select("application_id, shares, share_class, ownership_pct_override")
        .eq("offering_id", offeringId),
    ]);

  const subByApp = new Map<string, number>();
  for (const s of (subs ?? []) as any[]) {
    if (s.commitment_cents != null) subByApp.set(s.application_id, Number(s.commitment_cents));
  }
  const fundedByApp = new Map<string, number>();
  for (const p of (pays ?? []) as any[]) {
    if (p.status !== "settled") continue;
    fundedByApp.set(
      p.application_id,
      (fundedByApp.get(p.application_id) ?? 0) + Number(p.amount_cents ?? 0),
    );
  }
  const profileByUser = new Map<string, any>();
  for (const p of (profiles ?? []) as any[]) profileByUser.set(p.user_id, p);
  const posByApp = new Map<string, any>();
  for (const p of (positions ?? []) as any[]) posByApp.set(p.application_id, p);

  const base = apps
    .map((a) => {
      const commitment = subByApp.get(a.id) ?? Number(a.commitment_cents ?? 0);
      const pos = posByApp.get(a.id);
      return {
        app: a,
        commitment,
        funded: fundedByApp.get(a.id) ?? 0,
        shares: pos?.shares != null ? Number(pos.shares) : null,
        share_class: (pos?.share_class as string) ?? "LP interest",
        override: pos?.ownership_pct_override != null ? Number(pos.ownership_pct_override) : null,
      };
    })
    .filter((r) => r.commitment > 0 || r.funded > 0 || (r.shares ?? 0) > 0)
    .sort((a, b) => b.commitment - a.commitment || a.app.created_at.localeCompare(b.app.created_at));

  const totalCommitted = base.reduce((s, r) => s + r.commitment, 0);
  const totalFunded = base.reduce((s, r) => s + r.funded, 0);
  const totalShares = base.reduce((s, r) => s + (r.shares ?? 0), 0);
  const target = offering.target_raise_cents ?? null;

  const holders: CapTableHolder[] = base.map((r, i) => {
    const isYou = r.app.user_id === viewerId;
    const profile = profileByUser.get(r.app.user_id);
    const realName = profile?.entity_name || profile?.legal_name || "Investor";
    const byMoney = pct(r.commitment, totalCommitted);
    const byShares = totalShares > 0 && r.shares != null ? pct(r.shares, totalShares) : 0;
    return {
      application_id: r.app.id,
      name: isYou ? `${realName} (you)` : canManage || namesVisible ? realName : `Investor ${i + 1}`,
      is_you: isYou,
      investor_type: profile?.investor_type ?? null,
      entity_name: profile?.entity_name ?? null,
      commitment_cents: r.commitment,
      funded_cents: r.funded,
      shares: r.shares,
      share_class: r.share_class,
      pct_of_committed: r.override ?? (byShares || byMoney),
      pct_of_funded: pct(r.funded, totalFunded),
      pct_of_target: target ? pct(r.commitment, target) : 0,
      status: r.app.status,
      funding_status: r.app.funding_status,
      committed_at: r.app.created_at,
    };
  });


  const you = holders.find((h) => h.is_you) ?? null;

  return {
    offering_id: offering.id,
    offering_name: offering.name,
    reg_type: offering.reg_type ?? null,
    target_raise_cents: target,
    total_committed_cents: totalCommitted,
    total_funded_cents: totalFunded,
    total_shares: totalShares,
    holder_count: holders.length,
    holders: canManage || namesVisible ? holders : you ? [you] : [],
    you,
    can_manage: canManage,
    names_visible: canManage || namesVisible,
    updated_at:
      base.reduce<string | null>((latest, r) => {
        const t = r.app.updated_at ?? r.app.created_at;
        return !latest || t > latest ? t : latest;
      }, null) ?? null,
  };
}

/** The live cap table for one fund, for a manager, admin or permitted investor. */
export const getFundCapTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: manageFlag } = await supabase.rpc("can_manage_diligence", {
      _offering_id: data.offering_id,
    });
    const canManage = Boolean(manageFlag);

    if (!canManage) {
      const { data: mine } = await supabase
        .from("investor_applications")
        .select("id")
        .eq("offering_id", data.offering_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!mine) throw new Error("You do not have access to this fund's cap table.");
    }

    let namesVisible = false;
    if (!canManage) {
      const { data: visible } = await supabase.rpc("diligence_cap_table_visible", {
        _offering_id: data.offering_id,
      });
      namesVisible = Boolean(visible);
    }

    return buildCapTable(data.offering_id, userId, canManage, namesVisible);
  });

/** Every fund the signed-in investor holds a position in, with their share. */
export const getMyOwnership = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: apps } = await supabase
      .from("investor_applications")
      .select("offering_id, status")
      .eq("user_id", userId);

    const offeringIds = Array.from(
      new Set(
        ((apps ?? []) as { offering_id: string; status: string }[])
          .filter((a) => !EXCLUDED_STATUSES.has(a.status))
          .map((a) => a.offering_id),
      ),
    );

    const tables = await Promise.all(
      offeringIds.map(async (id) => {
        let namesVisible = false;
        const { data: visible } = await supabase.rpc("diligence_cap_table_visible", {
          _offering_id: id,
        });
        namesVisible = Boolean(visible);
        return buildCapTable(id, userId, false, namesVisible);
      }),
    );

    return tables.filter((t) => t.you !== null);
  });

/** One fund's value from the signed-in investor's point of view. */
export interface MyPortfolioValue {
  offering_id: string;
  offering_name: string;
  reg_type: string | null;
  /** The fund's stated price per share, when one is set. */
  share_price_cents: number | null;
  /** Units/interests recorded for this investor. */
  shares: number | null;
  share_class: string;
  commitment_cents: number;
  funded_cents: number;
  pct_of_committed: number;
  /**
   * What the holding is worth: shares × the fund's share price when both
   * exist, otherwise the capital the fund has actually received.
   */
  equity_value_cents: number;
  valued_by: "share_price" | "capital";
}

/** Every fund the signed-in investor holds, valued at share price or received capital. */
export const getMyPortfolioValue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: apps } = await supabase
      .from("investor_applications")
      .select("id, offering_id, status")
      .eq("user_id", userId);

    const active = ((apps ?? []) as { id: string; offering_id: string; status: string }[]).filter(
      (a) => !EXCLUDED_STATUSES.has(a.status),
    );
    if (active.length === 0) return [] as MyPortfolioValue[];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const offeringIds = Array.from(new Set(active.map((a) => a.offering_id)));

    const [{ data: offerings }, { data: positions }] = await Promise.all([
      supabaseAdmin
        .from("offerings")
        .select("id, name, reg_type, share_price_cents")
        .in("id", offeringIds),
      supabaseAdmin
        .from("investor_cap_positions")
        .select("application_id, shares, share_class")
        .in(
          "application_id",
          active.map((a) => a.id),
        ),
    ]);

    const offeringById = new Map<string, any>();
    for (const o of (offerings ?? []) as any[]) offeringById.set(o.id, o);
    const posByApp = new Map<string, any>();
    for (const p of (positions ?? []) as any[]) posByApp.set(p.application_id, p);

    const tables = await Promise.all(
      offeringIds.map((id) => buildCapTable(id, userId, false, false)),
    );
    const tableByOffering = new Map(tables.map((t) => [t.offering_id, t]));

    const rows: MyPortfolioValue[] = [];
    for (const app of active) {
      const offering = offeringById.get(app.offering_id);
      const you = tableByOffering.get(app.offering_id)?.you;
      if (!offering || !you) continue;
      const price = offering.share_price_cents != null ? Number(offering.share_price_cents) : null;
      const pos = posByApp.get(app.id);
      const shares = pos?.shares != null ? Number(pos.shares) : null;
      const valuedByPrice = shares != null && price != null && price > 0;
      rows.push({
        offering_id: offering.id,
        offering_name: offering.name,
        reg_type: offering.reg_type ?? null,
        share_price_cents: price,
        shares,
        share_class: (pos?.share_class as string) ?? "LP interest",
        commitment_cents: you.commitment_cents,
        funded_cents: you.funded_cents,
        pct_of_committed: you.pct_of_committed,
        equity_value_cents: valuedByPrice ? Math.round(shares * price) : you.funded_cents,
        valued_by: valuedByPrice ? "share_price" : "capital",
      });
    }
    return rows;
  });

/* ------------------------------------------------------------------ *
 * Manager / admin cap table editing
 * ------------------------------------------------------------------ */

/** Funds whose cap table the signed-in manager or admin may edit. */
export const listCapTableFunds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin");
    const isAdmin = (roles ?? []).length > 0;

    if (isAdmin) {
      const { data } = await supabase
        .from("offerings")
        .select("id, name, reg_type, target_raise_cents")
        .order("name", { ascending: true });
      return { funds: data ?? [], isAdmin: true };
    }

    const { data: mine } = await supabase
      .from("fund_managers")
      .select("offering_id")
      .eq("user_id", userId);
    const ids = (mine ?? []).map((m: any) => m.offering_id as string);
    if (ids.length === 0) return { funds: [], isAdmin: false };
    const { data } = await supabase
      .from("offerings")
      .select("id, name, reg_type, target_raise_cents")
      .in("id", ids)
      .order("name", { ascending: true });
    return { funds: data ?? [], isAdmin: false };
  });

export interface CapTableEditorRow {
  application_id: string;
  user_id: string;
  name: string;
  email: string | null;
  investor_type: string | null;
  status: string;
  funding_status: string | null;
  commitment_cents: number;
  funded_cents: number;
  shares: number | null;
  share_class: string;
  ownership_pct_override: number | null;
  notes: string | null;
  /** The percentage actually shown: the override when set, otherwise by shares, otherwise by money. */
  ownership_pct: number;
  pct_of_committed: number;
  pct_of_shares: number;
  updated_at: string | null;
  /** This investor's own wire fee in cents, or null when the fund's standard fee applies. */
  wire_fee_override_cents: number | null;
  /** The fee actually charged to this investor: their own rate, otherwise the fund's. */
  wire_fee_cents: number;
  /** Why this investor's rate differs. */
  wire_fee_note: string | null;
  /** Money received from this investor less their wire fee. */
  net_received_cents: number;
}

async function assertCanManage(supabase: any, offeringId: string) {
  const { data } = await supabase.rpc("can_manage_diligence", { _offering_id: offeringId });
  if (!data) throw new Error("Forbidden: you do not manage this fund.");
}

/** Builds one fund's editable cap table. Callers must authorise first. */
async function buildFundCapTable(supabaseAdmin: any, data: { offering_id: string }) {
  {


    const { data: offering } = await supabaseAdmin
      .from("offerings")
      .select(
        "id, name, reg_type, target_raise_cents, share_price_cents, wire_fee_cents, closing_cost_cents",
      )

      .eq("id", data.offering_id)
      .maybeSingle();
    if (!offering) throw new Error("That fund is not available.");

    const { data: appsRaw } = await supabaseAdmin
      .from("investor_applications")
      .select(
        "id, user_id, status, funding_status, commitment_cents, created_at, wire_fee_cents, wire_fee_note",
      )
      .eq("offering_id", data.offering_id);
    const apps = ((appsRaw ?? []) as any[]).filter((a) => !EXCLUDED_STATUSES.has(a.status));
    const appIds = apps.map((a) => a.id as string);

    const [{ data: subs }, { data: pays }, { data: profiles }, { data: positions }] =
      await Promise.all([
        appIds.length
          ? supabaseAdmin
              .from("subscriptions")
              .select("application_id, commitment_cents")
              .in("application_id", appIds)
          : Promise.resolve({ data: [] as any[] }),
        appIds.length
          ? supabaseAdmin
              .from("payments")
              .select("application_id, amount_cents, status")
              .in("application_id", appIds)
          : Promise.resolve({ data: [] as any[] }),
        apps.length
          ? supabaseAdmin
              .from("profiles")
              .select("user_id, legal_name, entity_name, email, investor_type")
              .in("user_id", Array.from(new Set(apps.map((a) => a.user_id as string))))
          : Promise.resolve({ data: [] as any[] }),
        supabaseAdmin
          .from("investor_cap_positions")
          .select("application_id, shares, share_class, ownership_pct_override, notes, updated_at")
          .eq("offering_id", data.offering_id),
      ]);

    const subByApp = new Map<string, number>();
    for (const s of (subs ?? []) as any[]) {
      if (s.commitment_cents != null) subByApp.set(s.application_id, Number(s.commitment_cents));
    }
    const fundedByApp = new Map<string, number>();
    for (const p of (pays ?? []) as any[]) {
      if (p.status !== "settled") continue;
      fundedByApp.set(
        p.application_id,
        (fundedByApp.get(p.application_id) ?? 0) + Number(p.amount_cents ?? 0),
      );
    }
    const profileByUser = new Map<string, any>();
    for (const p of (profiles ?? []) as any[]) profileByUser.set(p.user_id, p);
    const posByApp = new Map<string, any>();
    for (const p of (positions ?? []) as any[]) posByApp.set(p.application_id, p);

    // The fund's standard wire fee; each investor may carry their own rate.
    const fundWireFeeCents = Number((offering as any).wire_fee_cents ?? 0);

    const base = apps.map((a) => {
      const pos = posByApp.get(a.id);
      const feeOverride = a.wire_fee_cents != null ? Number(a.wire_fee_cents) : null;
      return {
        app: a,
        commitment: subByApp.get(a.id) ?? Number(a.commitment_cents ?? 0),
        funded: fundedByApp.get(a.id) ?? 0,
        shares: pos?.shares != null ? Number(pos.shares) : null,
        share_class: (pos?.share_class as string) ?? "LP interest",
        override: pos?.ownership_pct_override != null ? Number(pos.ownership_pct_override) : null,
        notes: (pos?.notes as string) ?? null,
        updated_at: (pos?.updated_at as string) ?? null,
        fee_override: feeOverride,
        fee: feeOverride ?? fundWireFeeCents,
        fee_note: (a.wire_fee_note as string) ?? null,
      };
    });

    const totalCommitted = base.reduce((s, r) => s + r.commitment, 0);
    const totalFunded = base.reduce((s, r) => s + r.funded, 0);
    const totalShares = base.reduce((s, r) => s + (r.shares ?? 0), 0);
    // A wire fee is only charged once money has actually arrived.
    const totalWireFees = base.reduce((s, r) => s + (r.funded > 0 ? r.fee : 0), 0);

    const rows: CapTableEditorRow[] = base
      .map((r) => {
        const profile = profileByUser.get(r.app.user_id);
        const byShares = totalShares > 0 && r.shares != null ? pct(r.shares, totalShares) : 0;
        const byMoney = pct(r.commitment, totalCommitted);
        const charged = r.funded > 0 ? r.fee : 0;
        return {
          application_id: r.app.id as string,
          user_id: r.app.user_id as string,
          name: profile?.entity_name || profile?.legal_name || profile?.email || "Investor",
          email: profile?.email ?? null,
          investor_type: profile?.investor_type ?? null,
          status: r.app.status as string,
          funding_status: (r.app.funding_status as string) ?? null,
          commitment_cents: r.commitment,
          funded_cents: r.funded,
          shares: r.shares,
          share_class: r.share_class,
          ownership_pct_override: r.override,
          notes: r.notes,
          ownership_pct: r.override ?? (byShares || byMoney),
          pct_of_committed: byMoney,
          pct_of_shares: byShares,
          updated_at: r.updated_at,
          wire_fee_override_cents: r.fee_override,
          wire_fee_cents: r.fee,
          wire_fee_note: r.fee_note,
          net_received_cents: Math.max(0, r.funded - charged),
        };
      })
      .sort((a, b) => b.ownership_pct - a.ownership_pct || a.name.localeCompare(b.name));

    return {
      offering: {
        id: offering.id as string,
        name: offering.name as string,
        reg_type: (offering.reg_type as string) ?? null,
        target_raise_cents: (offering.target_raise_cents as number) ?? null,
        share_price_cents: ((offering as any).share_price_cents as number) ?? 0,
        wire_fee_cents: fundWireFeeCents,
        closing_cost_cents: Number((offering as any).closing_cost_cents ?? 0),
      },
      rows,
      totals: {
        committed_cents: totalCommitted,
        funded_cents: totalFunded,
        shares: totalShares,
        investors: rows.length,
        ownership_pct: Math.round(rows.reduce((s, r) => s + r.ownership_pct, 0) * 10000) / 10000,
        wire_fees_cents: totalWireFees,
        net_received_cents: Math.max(0, totalFunded - totalWireFees),
      },
    };
  }
}

export type FundCapTableEditor = Awaited<ReturnType<typeof buildFundCapTable>>;

/** Every investor position in one fund, with the numbers a manager can edit. */
export const getCapTableEditor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, data.offering_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return buildFundCapTable(supabaseAdmin, data);
  });

/** Every fund the viewer can manage, each with its full cap table. */
export const getCapTableBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin");
    const isAdmin = (roles ?? []).length > 0;

    let ids: string[] = [];
    if (isAdmin) {
      const { data } = await supabase.from("offerings").select("id");
      ids = ((data ?? []) as any[]).map((o) => o.id as string);
    } else {
      const { data } = await supabase
        .from("fund_managers")
        .select("offering_id")
        .eq("user_id", userId);
      ids = ((data ?? []) as any[]).map((m) => m.offering_id as string);
    }
    if (ids.length === 0) return { isAdmin, funds: [] as FundCapTableEditor[] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const funds = await Promise.all(
      ids.map((id) => buildFundCapTable(supabaseAdmin, { offering_id: id })),
    );
    funds.sort(
      (a, b) =>
        b.totals.committed_cents - a.totals.committed_cents ||
        a.offering.name.localeCompare(b.offering.name),
    );
    return { isAdmin, funds };
  });

export interface PortfolioHolderValue {
  application_id: string;
  name: string;
  email: string | null;
  shares: number | null;
  share_class: string;
  ownership_pct: number;
  committed_cents: number;
  received_cents: number;
  /** What this holder's stake is worth at the fund's current value per share. */
  value_cents: number;
  /** Value less money actually received from them. */
  gain_cents: number;
}

export interface PortfolioFundValue {
  offering_id: string;
  offering_name: string;
  reg_type: string | null;
  target_raise_cents: number | null;
  committed_cents: number;
  received_cents: number;
  /** Equity value of the fund: shares x share price, or money received when no price is set. */
  equity_value_cents: number;
  /** The fund's set share price in cents, 0 when none is set. */
  share_price_cents: number;

  shares: number;
  /** Equity value divided by shares, in cents. Null when no shares are recorded. */
  value_per_share_cents: number | null;
  /** Committed capital divided by shares, in cents. Null when no shares are recorded. */
  committed_per_share_cents: number | null;
  investors: number;
  funded_pct: number;
  holders: PortfolioHolderValue[];
}

/** Live equity value per share for every fund the viewer can see. */
export const getPortfolioValue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin");
    const isAdmin = (roles ?? []).length > 0;

    let ids: string[] = [];
    if (isAdmin) {
      const { data } = await supabase.from("offerings").select("id");
      ids = ((data ?? []) as any[]).map((o) => o.id as string);
    } else {
      const { data } = await supabase
        .from("fund_managers")
        .select("offering_id")
        .eq("user_id", userId);
      ids = ((data ?? []) as any[]).map((m) => m.offering_id as string);
    }
    if (ids.length === 0) {
      return {
        isAdmin,
        funds: [] as PortfolioFundValue[],
        totals: { committed_cents: 0, received_cents: 0, equity_value_cents: 0, investors: 0 },
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tables = await Promise.all(
      ids.map((id) => buildFundCapTable(supabaseAdmin, { offering_id: id })),
    );

    const funds: PortfolioFundValue[] = tables
      .map((t) => {
        const shares = t.totals.shares;
        // When the fund has a set share price, value the equity at that price.
        const sharePrice = t.offering.share_price_cents ?? 0;
        const equity = sharePrice > 0 && shares > 0 ? sharePrice * shares : t.totals.funded_cents;
        const perShare = sharePrice > 0 ? sharePrice : shares > 0 ? equity / shares : null;
        const holders: PortfolioHolderValue[] = t.rows.map((r) => {

          const value =
            perShare != null && r.shares != null
              ? Math.round(perShare * r.shares)
              : Math.round((equity * r.ownership_pct) / 100);
          return {
            application_id: r.application_id,
            name: r.name,
            email: r.email,
            shares: r.shares,
            share_class: r.share_class,
            ownership_pct: r.ownership_pct,
            committed_cents: r.commitment_cents,
            received_cents: r.funded_cents,
            value_cents: value,
            gain_cents: value - r.funded_cents,
          };
        });
        return {
          offering_id: t.offering.id,
          offering_name: t.offering.name,
          reg_type: t.offering.reg_type,
          target_raise_cents: t.offering.target_raise_cents,
          committed_cents: t.totals.committed_cents,
          received_cents: t.totals.funded_cents,
          equity_value_cents: equity,
          share_price_cents: sharePrice,

          shares,
          value_per_share_cents: perShare == null ? null : Math.round(perShare * 100) / 100,
          committed_per_share_cents:
            shares > 0 ? Math.round((t.totals.committed_cents / shares) * 100) / 100 : null,
          investors: t.totals.investors,
          funded_pct:
            t.totals.committed_cents > 0
              ? Math.round((equity / t.totals.committed_cents) * 10000) / 100
              : 0,
          holders,
        };
      })
      .sort(
        (a, b) =>
          b.equity_value_cents - a.equity_value_cents ||
          a.offering_name.localeCompare(b.offering_name),
      );

    return {
      isAdmin,
      funds,
      totals: {
        committed_cents: funds.reduce((s, f) => s + f.committed_cents, 0),
        received_cents: funds.reduce((s, f) => s + f.received_cents, 0),
        equity_value_cents: funds.reduce((s, f) => s + f.equity_value_cents, 0),
        investors: funds.reduce((s, f) => s + f.investors, 0),
      },
    };
  });




const positionSchema = z.object({
  application_id: z.string().uuid(),
  offering_id: z.string().uuid(),
  shares: z.number().min(0).nullable(),
  share_class: z.string().trim().min(1).max(60),
  ownership_pct_override: z.number().min(0).max(100).nullable(),
  notes: z.string().trim().max(500).nullable(),
  commitment_cents: z.number().int().min(0).nullable(),
  /** This investor's own wire fee in cents; null clears it back to the fund's standard fee. */
  wire_fee_cents: z.number().int().min(0).max(100_000_00).nullable().optional(),
  wire_fee_note: z.string().trim().max(200).nullable().optional(),
});

export type CapPositionInput = z.infer<typeof positionSchema>;

/** Manager edits one investor's shares, class, ownership and committed capital. */
export const saveCapPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => positionSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, data.offering_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: app } = await supabaseAdmin
      .from("investor_applications")
      .select("id, offering_id, commitment_cents, wire_fee_cents, wire_fee_note")
      .eq("id", data.application_id)
      .maybeSingle();
    if (!app || app.offering_id !== data.offering_id) {
      throw new Error("That investor is not in this fund.");
    }

    const { data: before } = await supabaseAdmin
      .from("investor_cap_positions")
      .select("shares, share_class, ownership_pct_override, notes")
      .eq("application_id", data.application_id)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("investor_cap_positions").upsert(
      {
        application_id: data.application_id,
        offering_id: data.offering_id,
        shares: data.shares,
        share_class: data.share_class,
        ownership_pct_override: data.ownership_pct_override,
        notes: data.notes,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "application_id" },
    );
    if (error) throw new Error(error.message);

    if (data.commitment_cents != null) {
      const { error: appErr } = await supabaseAdmin
        .from("investor_applications")
        .update({ commitment_cents: data.commitment_cents })
        .eq("id", data.application_id);
      if (appErr) throw new Error(appErr.message);
      // Keep a confirmed subscription in step so every view agrees.
      await supabaseAdmin
        .from("subscriptions")
        .update({ commitment_cents: data.commitment_cents })
        .eq("application_id", data.application_id);
    }

    // This investor's own wire fee: null puts them back on the fund's standard rate.
    if (data.wire_fee_cents !== undefined || data.wire_fee_note !== undefined) {
      const patch: { wire_fee_cents?: number | null; wire_fee_note?: string | null } = {};
      if (data.wire_fee_cents !== undefined) patch.wire_fee_cents = data.wire_fee_cents;
      if (data.wire_fee_note !== undefined) patch.wire_fee_note = data.wire_fee_note || null;
      const { error: feeErr } = await supabaseAdmin
        .from("investor_applications")
        .update(patch)
        .eq("id", data.application_id);
      if (feeErr) throw new Error(feeErr.message);
    }

    // Append-only trail of what actually changed.
    const text = (v: unknown) => (v == null || v === "" ? null : String(v));
    const candidates: Array<{ field: string; old: string | null; next: string | null }> = [
      { field: "shares", old: text(before?.shares ?? null), next: text(data.shares) },
      {
        field: "share_class",
        old: text(before?.share_class ?? null),
        next: text(data.share_class),
      },
      {
        field: "ownership_pct_override",
        old: text(before?.ownership_pct_override ?? null),
        next: text(data.ownership_pct_override),
      },
      { field: "notes", old: text(before?.notes ?? null), next: text(data.notes) },
    ];
    if (data.commitment_cents != null) {
      candidates.push({
        field: "commitment_cents",
        old: text(app.commitment_cents ?? null),
        next: text(data.commitment_cents),
      });
    }
    if (data.wire_fee_cents !== undefined) {
      candidates.push({
        field: "wire_fee_cents",
        old: text(app.wire_fee_cents ?? null),
        next: text(data.wire_fee_cents),
      });
    }
    if (data.wire_fee_note !== undefined) {
      candidates.push({
        field: "wire_fee_note",
        old: text(app.wire_fee_note ?? null),
        next: text(data.wire_fee_note),
      });
    }
    const changes = candidates
      .filter((c) => (c.old ?? "") !== (c.next ?? ""))
      .map((c) => ({
        offering_id: data.offering_id,
        application_id: data.application_id,
        changed_by: context.userId,
        field: c.field,
        old_value: c.old,
        new_value: c.next,
        note: data.notes,
      }));
    if (changes.length > 0) {
      await supabaseAdmin.from("cap_table_changes").insert(changes);
      await (await import("@/lib/ownership-email.server")).notifyOwnershipChange(
        data.offering_id,
        "Your fund's cap table was updated, so the ownership split has been recalculated.",
      );
    }

    return { ok: true, logged: changes.length };
  });


export type CapTableChange = {
  id: string;
  created_at: string;
  field: string;
  field_label: string;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  investor_name: string;
  application_id: string;
  changed_by_name: string;
};

const FIELD_LABELS: Record<string, string> = {
  shares: "Shares",
  share_class: "Share class",
  ownership_pct_override: "Ownership percentage",
  notes: "Note",
  commitment_cents: "Committed capital",
  wire_fee_cents: "Wire fee",
  wire_fee_note: "Wire fee note",
};

/** Trail of every ownership or commitment edit for a fund. */
export const getCapTableLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ offering_id: z.string().uuid(), limit: z.number().int().min(1).max(500).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, data.offering_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("cap_table_changes")
      .select("id, created_at, field, old_value, new_value, note, application_id, changed_by")
      .eq("offering_id", data.offering_id)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    if (list.length === 0) return { entries: [] as CapTableChange[] };

    const appIds = [...new Set(list.map((r) => r.application_id))];
    const { data: apps } = await supabaseAdmin
      .from("investor_applications")
      .select("id, user_id")
      .in("id", appIds);

    const userIds = [
      ...new Set([
        ...(apps ?? []).map((a) => a.user_id as string),
        ...list.map((r) => r.changed_by).filter((v): v is string => Boolean(v)),
      ]),
    ];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, legal_name, entity_name, email")
      .in("user_id", userIds);
    const nameByUser = new Map<string, string>();
    for (const p of profiles ?? []) {
      nameByUser.set(
        p.user_id as string,
        (p.entity_name as string) || (p.legal_name as string) || (p.email as string) || "Someone",
      );
    }
    const userByApp = new Map<string, string>();
    for (const a of apps ?? []) userByApp.set(a.id as string, a.user_id as string);

    const entries: CapTableChange[] = list.map((r) => ({
      id: r.id as string,
      created_at: r.created_at as string,
      field: r.field as string,
      field_label: FIELD_LABELS[r.field as string] ?? (r.field as string),
      old_value: (r.old_value as string) ?? null,
      new_value: (r.new_value as string) ?? null,
      note: (r.note as string) ?? null,
      application_id: r.application_id as string,
      investor_name: nameByUser.get(userByApp.get(r.application_id as string) ?? "") ?? "Investor",
      changed_by_name: r.changed_by ? (nameByUser.get(r.changed_by as string) ?? "Team member") : "Team member",
    }));

    return { entries };
  });

