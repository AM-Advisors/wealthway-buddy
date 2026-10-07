/**
 * Super Admin self-approval. A maker-checker rule that would block a Super
 * Admin from approving their own work may be waived only with a written
 * reason, which is stored append-only in self_approval_overrides BEFORE the
 * approval is retried (recordSelfApprovalFn). Database segregation-of-duties
 * triggers honour a matching override for 5 minutes. Everyone else keeps the
 * second-person rule.
 */
import { SELF_APPROVAL_MARKER } from "@/lib/self-approval-shared";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const { data } = await (await admin()).from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin").maybeSingle();
  return !!data;
}

/** A matching reasoned override recorded in the last 5 minutes. */
async function hasRecentOverride(userId: string, action: string, ids: string[]): Promise<boolean> {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  let q = (await admin()).from("self_approval_overrides").select("id").eq("user_id", userId).eq("action", action).gt("created_at", since);
  if (ids.length) q = q.overlaps("record_ids", ids);
  const { data } = await q.limit(1);
  return !!data?.length;
}

/**
 * Returns true when the caller is a Super Admin with a fresh recorded reason.
 * Returns false for anyone else, so the caller keeps its normal second-person error.
 * Throws a reason prompt for a Super Admin who hasn't recorded a reason yet.
 */
export async function selfApprove(userId: string, action: string, recordIds: Array<string | null | undefined>): Promise<boolean> {
  if (!(await isSuperAdmin(userId))) return false;
  const ids = recordIds.filter((x): x is string => !!x);
  if (!(await hasRecentOverride(userId, action, ids))) {
    const key = `${action}:${ids[0] ?? "none"}`;
    throw new Error(`You're approving your own work. As a Super Admin you can, after you give a reason in the box that opened. Then click again. ${SELF_APPROVAL_MARKER}${key}]`);
  }
  return true;
}
