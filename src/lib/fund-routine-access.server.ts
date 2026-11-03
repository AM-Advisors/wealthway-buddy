import { isGrantLive } from "./fund-team-access";

/** A reviewer never becomes a manager; every use checks the exact current grant. */
export async function routineReviewer(db: any, userId: string, offeringId: string): Promise<boolean> {
  const { data: grants, error } = await db.from("fund_team_grants")
    .select("role,status,expires_at,granted_by,scope,offering_id")
    .eq("grantee_user_id", userId).eq("offering_id", offeringId).eq("role", "fund_reviewer").eq("scope", "fund").eq("status", "active");
  if (error) throw new Error("Fund review access could not be checked.");
  for (const grant of grants ?? []) {
    if (!isGrantLive(grant)) continue;
    const [{ data: manager, error: managerError }, { data: staff, error: staffError }] = await Promise.all([
      db.from("fund_managers").select("id").eq("user_id", grant.granted_by).eq("offering_id", offeringId).maybeSingle(),
      db.from("user_roles").select("role").eq("user_id", grant.granted_by).in("role", ["admin", "super_admin"]),
    ]);
    if (managerError || staffError) throw new Error("Granting authority could not be checked.");
    if (manager || staff?.length) return true;
  }
  return false;
}

export async function assertRoutineFund(db: any, userId: string, offeringId: string) {
  const [{ data: roles, error }, { data: manager, error: managerError }] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db.from("fund_managers").select("id").eq("user_id", userId).eq("offering_id", offeringId).maybeSingle(),
  ]);
  if (error || managerError) throw new Error("Fund authority could not be checked.");
  const staff = (roles ?? []).some((r: any) => ["admin", "super_admin", "operations", "fund_administration", "legal", "compliance"].includes(r.role));
  if (staff || manager) return { staff, reviewer: false };
  if (await routineReviewer(db, userId, offeringId)) return { staff: false, reviewer: true };
  throw new Error("You are not authorized to manage routine work for this fund.");
}

export const ROUTINE_FUND_FIELDS = ["displayName", "minInvestmentCents", "maxInvestmentCents", "targetRaiseCents", "maxOfferingCents", "offeringOpenDate", "offeringCloseDate", "arbitrationCity", "arbitrationState", "rollingCloses", "hasMultipleClasses", "plannedClassCount"] as const;
export function assertRoutineFields(fields: Record<string, unknown>) {
  if (Object.keys(fields).some(key => !ROUTINE_FUND_FIELDS.some(allowed => allowed === key))) throw new Error("Identity, signatory, tax and access details require their existing authorized actions.");
}