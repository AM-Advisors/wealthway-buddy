/** Server-only reader for the shared fund access answer (see fund-access.ts). */
import { FUND_OPERATIONS_ROLES } from "@/lib/staff-roles";
import { summarizeFundAccess, allowsFundLevel, type FundAccess, type FundAccessLevel } from "@/lib/fund-access";

export async function fundAccessFor(db: any, uid: string, fundId: string): Promise<FundAccess> {
  const { isClientMemberOfFund } = await import("@/lib/fund-cap-table.functions");
  const { liveGrants } = await import("@/lib/fund-team-access.functions");
  const [{ data: roles }, { data: mgr }, clientMember, grants] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", uid),
    db.from("fund_managers").select("id").eq("user_id", uid).eq("offering_id", fundId).limit(1).maybeSingle(),
    isClientMemberOfFund(db, uid, fundId),
    liveGrants(db, uid).catch(() => [] as any[]),
  ]);
  const team = (grants as any[]).find((g) => g.offering_id === fundId) ?? null;
  return summarizeFundAccess({
    staff: ((roles ?? []) as any[]).some((r) => FUND_OPERATIONS_ROLES.includes(r.role)),
    manager: !!mgr,
    clientMember,
    teamRole: team?.role ?? null,
    teamSource: team ? (team.source ?? "grant") : null,
  });
}

export async function requireFundAccess(db: any, uid: string, fundId: string, level: FundAccessLevel): Promise<FundAccess> {
  const a = await fundAccessFor(db, uid, fundId);
  if (!allowsFundLevel(a, level)) throw new Error("You don't have access to this Fund.");
  return a;
}

/** Same answer as requireFundAccess, as a yes/no, so existing screens can keep their own wording. */
export async function fundAccessAllows(db: any, uid: string, fundId: string, level: FundAccessLevel): Promise<boolean> {
  return allowsFundLevel(await fundAccessFor(db, uid, fundId), level);
}

/** Admin database client for fund access reads, loaded only on the server. */
export async function fundAccessDb(): Promise<any> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}
