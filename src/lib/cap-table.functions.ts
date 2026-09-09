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

  const [{ data: subs }, { data: pays }, { data: profiles }] = await Promise.all([
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

  const base = apps
    .map((a) => {
      const commitment = subByApp.get(a.id) ?? Number(a.commitment_cents ?? 0);
      return { app: a, commitment, funded: fundedByApp.get(a.id) ?? 0 };
    })
    .filter((r) => r.commitment > 0 || r.funded > 0)
    .sort((a, b) => b.commitment - a.commitment || a.app.created_at.localeCompare(b.app.created_at));

  const totalCommitted = base.reduce((s, r) => s + r.commitment, 0);
  const totalFunded = base.reduce((s, r) => s + r.funded, 0);
  const target = offering.target_raise_cents ?? null;

  const holders: CapTableHolder[] = base.map((r, i) => {
    const isYou = r.app.user_id === viewerId;
    const profile = profileByUser.get(r.app.user_id);
    const realName = profile?.entity_name || profile?.legal_name || "Investor";
    return {
      application_id: r.app.id,
      name: isYou ? `${realName} (you)` : canManage || namesVisible ? realName : `Investor ${i + 1}`,
      is_you: isYou,
      investor_type: profile?.investor_type ?? null,
      entity_name: profile?.entity_name ?? null,
      commitment_cents: r.commitment,
      funded_cents: r.funded,
      pct_of_committed: pct(r.commitment, totalCommitted),
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
}

async function assertCanManage(supabase: any, offeringId: string) {
  const { data } = await supabase.rpc("can_manage_diligence", { _offering_id: offeringId });
  if (!data) throw new Error("Forbidden: you do not manage this fund.");
}

/** Every investor position in one fund, with the numbers a manager can edit. */
export const getCapTableEditor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, data.offering_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: offering } = await supabaseAdmin
      .from("offerings")
      .select("id, name, reg_type, target_raise_cents")
      .eq("id", data.offering_id)
      .maybeSingle();
    if (!offering) throw new Error("That fund is not available.");

    const { data: appsRaw } = await supabaseAdmin
      .from("investor_applications")
      .select("id, user_id, status, funding_status, commitment_cents, created_at")
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

    const base = apps.map((a) => {
      const pos = posByApp.get(a.id);
      return {
        app: a,
        commitment: subByApp.get(a.id) ?? Number(a.commitment_cents ?? 0),
        funded: fundedByApp.get(a.id) ?? 0,
        shares: pos?.shares != null ? Number(pos.shares) : null,
        share_class: (pos?.share_class as string) ?? "LP interest",
        override: pos?.ownership_pct_override != null ? Number(pos.ownership_pct_override) : null,
        notes: (pos?.notes as string) ?? null,
        updated_at: (pos?.updated_at as string) ?? null,
      };
    });

    const totalCommitted = base.reduce((s, r) => s + r.commitment, 0);
    const totalFunded = base.reduce((s, r) => s + r.funded, 0);
    const totalShares = base.reduce((s, r) => s + (r.shares ?? 0), 0);

    const rows: CapTableEditorRow[] = base
      .map((r) => {
        const profile = profileByUser.get(r.app.user_id);
        const byShares = totalShares > 0 && r.shares != null ? pct(r.shares, totalShares) : 0;
        const byMoney = pct(r.commitment, totalCommitted);
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
        };
      })
      .sort((a, b) => b.ownership_pct - a.ownership_pct || a.name.localeCompare(b.name));

    return {
      offering: {
        id: offering.id as string,
        name: offering.name as string,
        reg_type: (offering.reg_type as string) ?? null,
        target_raise_cents: (offering.target_raise_cents as number) ?? null,
      },
      rows,
      totals: {
        committed_cents: totalCommitted,
        funded_cents: totalFunded,
        shares: totalShares,
        investors: rows.length,
        ownership_pct: Math.round(rows.reduce((s, r) => s + r.ownership_pct, 0) * 10000) / 10000,
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
});

/** Manager edits one investor's shares, class, ownership and committed capital. */
export const saveCapPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => positionSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, data.offering_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: app } = await supabaseAdmin
      .from("investor_applications")
      .select("id, offering_id")
      .eq("id", data.application_id)
      .maybeSingle();
    if (!app || app.offering_id !== data.offering_id) {
      throw new Error("That investor is not in this fund.");
    }

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

    return { ok: true };
  });
