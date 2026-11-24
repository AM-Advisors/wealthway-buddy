import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { grantRefusal, isGrantLive, isFundTeamRole, listedTeamViewerRole, fundScopedContactFund, companyViewerFunds, fundOpenMode, type FundTeamRole, type FundTeamScope } from "@/lib/fund-team-access";

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
  // Shared fund check, fund's own manager list only (no staff shortcut here).
  const { fundMembershipAllows } = await import("@/lib/fund-access.server");
  return fundMembershipAllows(db, userId, offeringId, "manager");
}

async function isStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as { role: string }[]).some((r) => ["admin", "super_admin"].includes(r.role));
}

/** A per-fund grant stays live while its granter is still a manager of that fund or still Harmonious staff. */
async function granterStillAuthorized(db: any, granterId: string, offeringId: string) {
  return (await isManagerOf(db, granterId, offeringId)) || (await isStaff(db, granterId));
}

async function logEvent(db: any, e: Record<string, unknown>) {
  await db.from("fund_team_grant_events").insert(e);
}

export const listFundTeamGrants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ fundId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const manager = await isManagerOf(db, context.userId, data.fundId);
    const staff = !manager && (await isStaff(context.supabase, context.userId));
    if (!manager && !staff) throw new Error("Forbidden: you do not manage that fund.");
    // Per-fund grants on this fund, plus scope grants whose coverage includes it.
    const { data: rows } = await db
      .from("fund_team_grants")
      .select("id, grantee_email, grantee_user_id, role, status, expires_at, granted_by, created_at, revoked_at, revoke_reason, scope, offering_id")
      .eq("offering_id", data.fundId)
      .order("created_at", { ascending: false });
    const { data: scoped } = await db
      .from("fund_team_grants")
      .select("id, grantee_email, grantee_user_id, role, status, expires_at, granted_by, created_at, revoked_at, revoke_reason, scope, offering_id")
      .neq("offering_id", data.fundId)
      .in("scope", ["all_funds", "all_managed"])
      .order("created_at", { ascending: false });
    const { data: mgrs } = await db.from("fund_managers").select("user_id").eq("offering_id", data.fundId);
    const mgrSet = new Set(((mgrs ?? []) as any[]).map((m) => m.user_id));
    const granters = [...new Set(((rows ?? []) as any[]).map((g) => g.granted_by).filter(Boolean))];
    const { data: staffRows } = granters.length ? await db.from("user_roles").select("user_id, role").in("user_id", granters).in("role", ["admin", "super_admin"]) : { data: [] };
    for (const r of (staffRows ?? []) as any[]) mgrSet.add(r.user_id);
    const out: any[] = [];
    for (const g of [...((rows ?? []) as any[]), ...((scoped ?? []) as any[])]) {
      const scope = (g.scope as FundTeamScope) ?? "fund";
      if (scope !== "fund" && g.offering_id !== data.fundId) {
        // Does this scope grant actually cover the viewed fund right now?
        if (scope === "all_managed" && !(await isManagerOf(db, g.granted_by, data.fundId))) continue;
        // all_funds covers every fund while active.
      }
      out.push({
        id: g.id as string,
        userId: g.grantee_user_id as string | null,
        email: g.grantee_email as string,
        claimed: !!g.grantee_user_id,
        role: g.role as FundTeamRole,
        scope,
        status:
          g.status === "active" && scope === "fund" && !mgrSet.has(g.granted_by)
            ? "needs_review"
            : g.status === "active" && !isGrantLive(g)
              ? "expired"
              : (g.status as string),
        expiresAt: g.expires_at as string | null,
        createdAt: g.created_at as string,
        revokedAt: g.revoked_at as string | null,
        revokeReason: g.revoke_reason as string | null,
      });
    }
    const { data: fund } = await db.from("offerings").select("routine_review_user_id").eq("id", data.fundId).maybeSingle();
    return { canManage: manager || staff, grants: out, reviewOwnerId: fund?.routine_review_user_id ?? null };
  });

/** Funds the caller may grant team access on: funds they manage, or every fund for staff. */
export const listGrantableFunds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const staff = await isStaff(context.supabase, context.userId);
    if (staff) {
      const { data: offs } = await db.from("offerings").select("id, name").order("name").limit(2000);
      return { staff: true, funds: ((offs ?? []) as any[]).map((o) => ({ id: o.id as string, name: o.name as string })) };
    }
    const { exactManagerFundIds } = await import("@/lib/fund-access.server");
    const ids = await exactManagerFundIds(db, context.userId);
    const { data: offs } = ids.length ? await db.from("offerings").select("id, name").in("id", ids).order("name") : { data: [] };
    return { staff: false, funds: ((offs ?? []) as any[]).map((o) => ({ id: o.id as string, name: o.name as string })) };
  });

export const grantFundTeamAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        fundId: z.string().uuid(),
        email: z.string().max(255),
        role: z.string(),
        expiresAt: z.string().nullable().optional(),
        fundIds: z.array(z.string().uuid()).max(500).optional(),
        scope: z.enum(["fund", "all_managed", "all_funds"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const email = data.email.trim().toLowerCase();
    const scope: FundTeamScope = data.scope ?? "fund";
    const staff = await isStaff(context.supabase, context.userId);
    const { data: person } = await db.from("persons").select("user_id").ilike("email", email).not("user_id", "is", null).maybeSingle();
    const granteeUserId: string | null = person?.user_id ?? null;

    async function investorIn(fundId: string) {
      if (!granteeUserId) return false;
      const { data: app } = await db
        .from("investor_applications")
        .select("id")
        .eq("offering_id", fundId)
        .eq("user_id", granteeUserId)
        .limit(1);
      return (app ?? []).length > 0;
    }

    async function grantOne(fundId: string, grantScope: FundTeamScope) {
      const granterIsFundManager = await isManagerOf(db, context.userId, fundId);
      const refusal = grantRefusal({
        granterIsFundManager,
        granterIsStaff: staff,
        granterUserId: context.userId,
        granterEmail: (context.claims as any)?.email ?? null,
        granteeEmail: email,
        granteeUserId,
        granteeIsInvestorInFund: await investorIn(fundId),
        role: data.role,
        scope: grantScope,
      });
      if (refusal) return { fundId, ok: false as const, error: refusal };
      const { data: row, error } = await db
        .from("fund_team_grants")
        .insert({
          offering_id: fundId,
          grantee_email: email,
          grantee_user_id: granteeUserId,
          role: data.role,
          scope: grantScope,
          granted_by: context.userId,
          expires_at: data.expiresAt || null,
        })
        .select("id")
        .single();
      if (error) {
        if (String(error.code) === "23505") return { fundId, ok: false as const, error: "That person already has access to this Fund." };
        return { fundId, ok: false as const, error: "Could not grant access." };
      }
      await logEvent(db, { grant_id: row.id, offering_id: fundId, event: "granted", actor_user_id: context.userId, after_role: data.role, reason: grantScope === "fund" ? null : `scope:${grantScope}` });
      return { fundId, ok: true as const };
    }

    if (scope !== "fund") {
      // One scope grant, anchored to the fund it was created from; coverage resolves at read time.
      const r = await grantOne(data.fundId, scope);
      if (!r.ok) throw new Error(r.error);
      return { ok: true, results: [r] };
    }
    const targets = [...new Set(data.fundIds?.length ? data.fundIds : [data.fundId])];
    const results = [] as Awaited<ReturnType<typeof grantOne>>[];
    for (const fid of targets) results.push(await grantOne(fid, "fund"));
    const failed = results.filter((r) => !r.ok);
    if (failed.length === results.length) throw new Error(failed[0]?.error ?? "Could not grant access.");
    return { ok: true, results };
  });

export const changeFundTeamAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
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
      if (!manager && !staff) throw new Error("Only a Fund Manager of this Fund can change roles.");
      if (!isFundTeamRole(data.role)) throw new Error("Choose Viewer, Assistant or Routine reviewer.");
      if (data.role === "fund_reviewer" && g.scope !== "fund") throw new Error("Designate routine reviewers for one fund at a time.");
      if (g.grantee_user_id === context.userId || String(g.grantee_email).toLowerCase() === String((context.claims as any)?.email ?? "").toLowerCase()) throw new Error("You cannot grant yourself access.");
      const { data: investor } = g.grantee_user_id ? await db.from("investor_onboardings").select("id").eq("investor_user_id", g.grantee_user_id).eq("offering_id", g.offering_id).is("removed_at", null).limit(1) : { data: [] };
      if (investor?.length) throw new Error("Investors in this fund cannot receive team authority.");
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

/** Live shared-fund access (grants and listed Team entries) for this exact login. Server-only callers. */
export async function liveGrants(db: any, userId: string) {
  const { data } = await db.from("fund_team_grants").select("id, offering_id, role, status, expires_at, granted_by, scope").eq("grantee_user_id", userId).eq("status", "active");
  const out: any[] = [];
  const seen = new Set<string>();
  for (const g of (data ?? []) as any[]) {
    if (!isGrantLive(g)) continue;
    const scope = (g.scope as FundTeamScope) ?? "fund";
    if (scope === "fund") {
      if (!(await granterStillAuthorized(db, g.granted_by, g.offering_id))) continue; // granting manager/staff removed → access paused
      if (!seen.has(g.offering_id)) { seen.add(g.offering_id); out.push(g); }
      continue;
    }
    // Scope grants resolve against current funds at read time, so new funds are auto-included.
    let fundIds: string[] = [];
    if (scope === "all_funds") {
      const { data: offs } = await db.from("offerings").select("id").limit(5000);
      fundIds = ((offs ?? []) as any[]).map((o) => o.id);
    } else {
      const { exactManagerFundIds } = await import("@/lib/fund-access.server");
      fundIds = await exactManagerFundIds(db, g.granted_by);
    }
    for (const fid of fundIds) {
      if (seen.has(fid)) continue;
      seen.add(fid);
      out.push({ ...g, offering_id: fid });
    }
  }
  // Listed fund team entries linked to this exact login see that fund as a Viewer.
  const { data: listed } = await db.from("fund_team_members").select("offering_id, user_id, removed_at, permissions").eq("user_id", userId).is("removed_at", null);
  for (const t of (listed ?? []) as any[]) {
    const role = listedTeamViewerRole(t, userId);
    if (!role || seen.has(t.offering_id)) continue;
    seen.add(t.offering_id);
    out.push({ offering_id: t.offering_id, role, status: "active", expires_at: null, granted_by: null, scope: "fund", source: "team_list" });
  }
  // Contacts created from one fund's screen (initial contact, signer, fund invite) see that fund only.
  const { data: scoped } = await db.from("client_contacts").select("user_id, status, deactivated_at, added_for_offering_id").eq("user_id", userId).not("added_for_offering_id", "is", null);
  for (const c of (scoped ?? []) as any[]) {
    const fid = fundScopedContactFund(c, userId);
    if (!fid || seen.has(fid)) continue;
    seen.add(fid);
    out.push({ offering_id: fid, role: "fund_viewer", status: "active", expires_at: null, granted_by: null, scope: "fund", source: "fund_contact" });
  }
  // View-only company members see that company's funds as a Viewer.
  const { data: memberships } = await db.from("client_users").select("client_id, client_role, revoked_at").eq("user_id", userId).is("revoked_at", null).eq("client_role", "client_readonly");
  const viewerClientIds = [...new Set(((memberships ?? []) as any[]).map((m) => m.client_id).filter(Boolean))];
  if (viewerClientIds.length) {
    const { data: companyFunds } = await db.from("offerings").select("id, client_id").in("client_id", viewerClientIds).limit(2000);
    for (const fid of companyViewerFunds((memberships ?? []) as any[], (companyFunds ?? []) as any[])) {
      if (seen.has(fid)) continue;
      seen.add(fid);
      out.push({ offering_id: fid, role: "fund_viewer", status: "active", expires_at: null, granted_by: null, scope: "fund", source: "company_viewer" });
    }
  }
  return out;
}

/** Whether this login opens a fund on the full fund page or the simple viewer page. Display routing only. */
export const getFundOpenMode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ fundId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const manager = await isManagerOf(db, context.userId, data.fundId);
    const staff = !manager && (await isStaff(context.supabase, context.userId));
    if (manager || staff) return { mode: "workspace" as const };
    const { data: off } = await db.from("offerings").select("client_id").eq("id", data.fundId).maybeSingle();
    const { data: rows } = off?.client_id
      ? await db.from("client_users").select("client_role").eq("user_id", context.userId).eq("client_id", off.client_id).is("revoked_at", null)
      : { data: [] };
    const shared = (await liveGrants(db, context.userId)).find((g) => g.offering_id === data.fundId);
    return {
      mode: fundOpenMode({
        isManager: false,
        isStaff: false,
        companyRolesForFund: ((rows ?? []) as any[]).map((r) => String(r.client_role)),
        sharedRole: (shared?.role as FundTeamRole | undefined) ?? null,
      }),
    };
  });

/** Overview + roster for a granted Fund. No banking, tax IDs, KYC or contact details. */
export const getSharedFund = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ fundId: z.string().uuid() }).parse(d))
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
