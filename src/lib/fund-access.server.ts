/** Server-only reader for the shared fund access answer (see fund-access.ts). */
import { FUND_OPERATIONS_ROLES } from "@/lib/staff-roles";
import { summarizeFundAccess, allowsFundLevel, allowsFundMembership, type FundAccess, type FundAccessLevel } from "@/lib/fund-access";

export const FUND_ACCESS_CHECK_FAILED = "Fund access could not be checked. Please try again.";

/**
 * Reads only the lists a level needs: "manager" skips client membership and team access,
 * "manage" skips team access; withStaff=false skips staff roles. Skipped lists answer "no".
 */
export async function fundAccessFor(
  db: any, uid: string, fundId: string, upTo: FundAccessLevel = "view", withStaff = true,
): Promise<FundAccess> {
  if (!uid || !fundId) return summarizeFundAccess({ staff: false, manager: false, clientMember: false, teamRole: null, teamSource: null });
  const none = Promise.resolve({ data: null as any, error: null as any });
  const [{ data: roles, error: rolesError }, { data: mgr, error: mgrError }, clientMember, grants] = await Promise.all([
    withStaff ? db.from("user_roles").select("role").eq("user_id", uid) : none,
    db.from("fund_managers").select("id").eq("user_id", uid).eq("offering_id", fundId),
    upTo === "manager" ? Promise.resolve(false) : clientMemberOfFund(db, uid, fundId),
    upTo === "view"
      ? import("@/lib/fund-team-access.functions").then(({ liveGrants }) => liveGrants(db, uid)).catch(() => [] as any[])
      : Promise.resolve([] as any[]),
  ]);
  // Fail closed with a plain message when a list can't be read, never a silent "no access" or raw database text.
  if (rolesError || mgrError) throw new Error(FUND_ACCESS_CHECK_FAILED);
  const team = (grants as any[]).find((g) => g.offering_id === fundId) ?? null;
  return summarizeFundAccess({
    staff: ((roles ?? []) as any[]).some((r) => FUND_OPERATIONS_ROLES.includes(r.role)),
    manager: ((mgr ?? []) as any[]).length > 0,
    clientMember,
    teamRole: team?.role ?? null,
    teamSource: team ? (team.source ?? "grant") : null,
  });
}

export async function requireFundAccess(db: any, uid: string, fundId: string, level: FundAccessLevel): Promise<FundAccess> {
  const a = await fundAccessFor(db, uid, fundId, level);
  if (!allowsFundLevel(a, level)) throw new Error("You don't have access to this Fund.");
  return a;
}

/** Same answer as requireFundAccess, as a yes/no, so existing screens can keep their own wording. */
export async function fundAccessAllows(db: any, uid: string, fundId: string, level: FundAccessLevel): Promise<boolean> {
  return allowsFundLevel(await fundAccessFor(db, uid, fundId, level), level);
}

/** Admin database client for fund access reads, loaded only on the server. */
export async function fundAccessDb(): Promise<any> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

/** Shared answer from the fund's own lists only, with no staff shortcut; the screen keeps its own named staff rule. */
export async function fundMembershipAllows(db: any, uid: string, fundId: string, level: FundAccessLevel): Promise<boolean> {
  return allowsFundMembership(await fundAccessFor(db, uid, fundId, level, false), level);
}

/** Funds where this login is on the fund manager list (exact funds only, no staff shortcut). The one reader for "which funds do I manage". */
export async function exactManagerFundIds(db: any, uid: string): Promise<string[]> {
  if (!uid) return [];
  const { data, error } = await db.from("fund_managers").select("offering_id").eq("user_id", uid);
  if (error) throw new Error(FUND_ACCESS_CHECK_FAILED);
  return [...new Set(((data ?? []) as any[]).map((r) => r.offering_id).filter(Boolean))] as string[];
}

/**
 * Every fund this login reaches at a level, from the same lists as fundAccessFor.
 * all=true for fund operations staff (every fund); otherwise ids lists the exact funds.
 */
export async function accessibleFunds(db: any, uid: string, level: FundAccessLevel): Promise<{ all: boolean; ids: string[] }> {
  if (!uid) return { all: false, ids: [] };
  const { data: roles, error } = await db.from("user_roles").select("role").eq("user_id", uid);
  if (error) throw new Error(FUND_ACCESS_CHECK_FAILED);
  if (((roles ?? []) as any[]).some((r) => FUND_OPERATIONS_ROLES.includes(r.role))) return { all: true, ids: [] };
  return { all: false, ids: await memberFundIds(db, uid, level) };
}

/** Funds reached through the fund's own lists only (no staff shortcut). */
export async function memberFundIds(db: any, uid: string, level: FundAccessLevel): Promise<string[]> {
  if (!uid) return [];
  const ids = new Set(await exactManagerFundIds(db, uid));
  if (level !== "manager") {
    // Matches isClientMemberOfFund: active client members, and managers of any fund under the same client.
    const [{ data: cu }, { data: mc }] = await Promise.all([
      db.from("client_users").select("client_id").eq("user_id", uid).is("revoked_at", null),
      db.from("fund_managers").select("offerings!inner(client_id)").eq("user_id", uid),
    ]);
    const clientIds = [...new Set([...((cu ?? []) as any[]).map((r) => r.client_id), ...((mc ?? []) as any[]).map((r) => r.offerings?.client_id)].filter(Boolean))];
    if (clientIds.length) {
      const { data: offs } = await db.from("offerings").select("id").in("client_id", clientIds);
      for (const o of (offs ?? []) as any[]) ids.add(o.id);
    }
  }
  if (level === "view") {
    const { liveGrants } = await import("@/lib/fund-team-access.functions");
    for (const g of ((await liveGrants(db, uid).catch(() => [])) as any[])) if (g.offering_id) ids.add(g.offering_id);
  }
  return [...ids];
}

/**
 * True when the login is an active member of the Client that owns this Fund, or manages any fund under that Client.
 * The one client-membership reader for fund access (isClientMemberOfFund delegates here).
 */
export async function clientMemberOfFund(db: any, uid: string, fundId: string): Promise<boolean> {
  const { data: off } = await db.from("offerings").select("client_id").eq("id", fundId).maybeSingle();
  if (!off?.client_id) return false;
  const { data: fm } = await db
    .from("fund_managers")
    .select("id, offerings!inner(client_id)")
    .eq("user_id", uid)
    .eq("offerings.client_id", off.client_id)
    .limit(1)
    .maybeSingle();
  if (fm) return true;
  const { data: cu } = await db.from("client_users").select("id").is("revoked_at", null).eq("user_id", uid).eq("client_id", off.client_id).maybeSingle();
  return !!cu;
}
