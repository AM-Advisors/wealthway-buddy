import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { grantRefusal, isGrantLive, type FundTeamRole } from "@/lib/fund-team-access";

/**
 * Fund Team Access server functions. Every call re-checks, on the server, that
 * the caller is an active Fund Manager of that exact Fund (for management) or
 * holds a live grant whose granting manager still manages the Fund (for viewing).
 */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function isManagerOf(db: any, userId: string, offeringId: string) {
  const { data } = await db
    .from("fund_managers")
    .select("id")
    .eq("user_id", userId)
    .eq("offering_id", offeringId)
    .maybeSingle();
  return !!data;
}

async function isStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as { role: string }[]).some((r) => ["admin", "super_admin"].includes(r.role));
}

async function logEvent(db: any, e: Record<string, unknown>) {
  await db.from("fund_team_grant_events").insert(e);
}

export const listFundTeamGrants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fundId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const manager = await isManagerOf(db, context.userId, data.fundId);
    const staff = !manager && (await isStaff(context.supabase, context.userId));
    if (!manager && !staff) throw new Error("Forbidden: you do not manage that fund.");
    const { data: rows } = await db
      .from("fund_team_grants")
      .select("id, grantee_email, grantee_user_id, role, status, expires_at, granted_by, created_at, revoked_at, revoke_reason")
      .eq("offering_id", data.fundId)
      .order("created_at", { ascending: false });
    const { data: mgrs } = await db.from("fund_managers").select("user_id").eq("offering_id", data.fundId);
    const mgrSet = new Set(((mgrs ?? []) as any[]).map((m) => m.user_id));
    return {
      canManage: manager || staff,
      grants: ((rows ?? []) as any[]).map((g) => ({
        id: g.id as string,
        email: g.grantee_email as string,
        claimed: !!g.grantee_user_id,
        role: g.role as FundTeamRole,
        status:
          g.status === "active" && !mgrSet.has(g.granted_by)
            ? "needs_review"
            : g.status === "active" && !isGrantLive(g)
              ? "expired"
              : (g.status as string),
        expiresAt: g.expires_at as string | null,
        createdAt: g.created_at as string,
        revokedAt: g.revoked_at as string | null,
        revokeReason: g.revoke_reason as string | null,
      })),
    };
  });

export const grantFundTeamAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        fundId: z.string().uuid(),
        email: z.string().max(255),
        role: z.string(),
        expiresAt: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const email = data.email.trim().toLowerCase();
    const granterIsFundManager = await isManagerOf(db, context.userId, data.fundId);
    const { data: person } = await db.from("persons").select("user_id").ilike("email", email).not("user_id", "is", null).maybeSingle();
    const granteeUserId: string | null = person?.user_id ?? null;
    let granteeIsInvestorInFund = false;
    if (granteeUserId) {
      const { data: app } = await db
        .from("investor_applications")
        .select("id")
        .eq("offering_id", data.fundId)
        .eq("user_id", granteeUserId)
        .limit(1);
      granteeIsInvestorInFund = (app ?? []).length > 0;
    }
    const refusal = grantRefusal({
      granterIsFundManager,
      granterUserId: context.userId,
      granterEmail: (context.claims as any)?.email ?? null,
      granteeEmail: email,
      granteeUserId,
      granteeIsInvestorInFund,
      role: data.role,
    });
    if (refusal) throw new Error(refusal);
    const { data: row, error } = await db
      .from("fund_team_grants")
      .insert({
        offering_id: data.fundId,
        grantee_email: email,
        grantee_user_id: granteeUserId,
        role: data.role,
        granted_by: context.userId,
        expires_at: data.expiresAt || null,
      })
      .select("id")
      .single();
    if (error) {
      if (String(error.code) === "23505") throw new Error("That person already has access to this Fund.");
      throw new Error("Could not grant access.");
    }
    await logEvent(db, { grant_id: row.id, offering_id: data.fundId, event: "granted", actor_user_id: context.userId, after_role: data.role });
    return { ok: true };
  });

export const changeFundTeamAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        grantId: z.string().uuid(),
        action: z.enum(["change_role", "revoke"]),
        role: z.string().optional(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: g } = await db.from("fund_team_grants").select("*").eq("id", data.grantId).maybeSingle();
    if (!g || g.status === "revoked") throw new Error("Access record not found.");
    const manager = await isManagerOf(db, context.userId, g.offering_id);
    const staff = !manager && (await isStaff(context.supabase, context.userId));
    if (!manager && !staff) throw new Error("Forbidden: you do not manage that fund.");
    if (data.action === "revoke") {
      await db
        .from("fund_team_grants")
        .update({ status: "revoked", revoked_at: new Date().toISOString(), revoke_reason: data.reason, updated_at: new Date().toISOString() })
        .eq("id", g.id);
      await logEvent(db, { grant_id: g.id, offering_id: g.offering_id, event: "revoked", actor_user_id: context.userId, before_role: g.role, reason: data.reason });
    } else {
      if (!manager) throw new Error("Only a Fund Manager of this Fund can change roles.");
      if (data.role !== "fund_viewer" && data.role !== "fund_assistant") throw new Error("Only Viewer or Assistant access can be granted.");
      // A role change re-grants under the current manager.
      await db.from("fund_team_grants").update({ role: data.role, granted_by: context.userId, status: "active", updated_at: new Date().toISOString() }).eq("id", g.id);
      await logEvent(db, { grant_id: g.id, offering_id: g.offering_id, event: "role_changed", actor_user_id: context.userId, before_role: g.role, after_role: data.role, reason: data.reason });
    }
    return { ok: true };
  });

/** Funds shared with the signed-in user, claiming email-matched grants on first view. */
export const listMySharedFunds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const email = String((context.claims as any)?.email ?? "").toLowerCase();
    if (email) {
      const { data: unclaimed } = await db
        .from("fund_team_grants")
        .select("id, offering_id")
        .is("grantee_user_id", null)
        .eq("status", "active")
        .ilike("grantee_email", email);
      for (const u of (unclaimed ?? []) as any[]) {
        await db.from("fund_team_grants").update({ grantee_user_id: context.userId }).eq("id", u.id);
        await logEvent(db, { grant_id: u.id, offering_id: u.offering_id, event: "claimed", actor_user_id: context.userId });
      }
    }
    const live = await liveGrants(db, context.userId);
    const ids = live.map((g) => g.offering_id);
    const { data: offs } = ids.length ? await db.from("offerings").select("id, name").in("id", ids) : { data: [] };
    const names = new Map(((offs ?? []) as any[]).map((o) => [o.id, o.name]));
    return { funds: live.map((g) => ({ fundId: g.offering_id, name: names.get(g.offering_id) ?? "Fund", role: g.role as FundTeamRole })) };
  });

async function liveGrants(db: any, userId: string) {
  const { data } = await db.from("fund_team_grants").select("offering_id, role, status, expires_at, granted_by").eq("grantee_user_id", userId).eq("status", "active");
  const out: any[] = [];
  for (const g of (data ?? []) as any[]) {
    if (!isGrantLive(g)) continue;
    if (!(await isManagerOf(db, g.granted_by, g.offering_id))) continue; // granting manager removed → access paused
    out.push(g);
  }
  return out;
}

/** Overview + roster for a granted Fund. No banking, tax IDs, KYC or contact details. */
export const getSharedFund = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fundId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const grant = (await liveGrants(db, context.userId)).find((g) => g.offering_id === data.fundId);
    if (!grant) throw new Error("Forbidden: you don't have access to that fund.");
    const { data: off } = await db.from("offerings").select("id, name").eq("id", data.fundId).maybeSingle();
    const { data: apps } = await db
      .from("investor_applications")
      .select("id, user_id, status, commitment_cents")
      .eq("offering_id", data.fundId)
      .limit(500);
    const uids = [...new Set(((apps ?? []) as any[]).map((a) => a.user_id).filter(Boolean))];
    const { data: ppl } = uids.length
      ? await db.from("persons").select("user_id, legal_first_name, legal_last_name").in("user_id", uids)
      : { data: [] };
    const nm = new Map(((ppl ?? []) as any[]).map((p) => [p.user_id, [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ")]));
    return {
      fund: { id: off?.id ?? data.fundId, name: off?.name ?? "Fund" },
      role: grant.role as FundTeamRole,
      roster: ((apps ?? []) as any[]).map((a) => ({
        id: a.id as string,
        name: (nm.get(a.user_id) as string) || "Investor",
        stage: String(a.status ?? "-"),
        committedCents: (a.commitment_cents as number | null) ?? null,
      })),
    };
  });
