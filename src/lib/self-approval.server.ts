/**
 * Super Admin self-approval. A maker-checker rule that would block a Super
 * Admin from approving their own work may be waived only with a written
 * reason, which is stored append-only in self_approval_overrides. Database
 * segregation-of-duties triggers honour a matching override for 5 minutes.
 * Everyone else keeps the second-person rule.
 */
import { getRequestHeader } from "@tanstack/react-start/server";
import { SELF_APPROVAL_HEADER, SELF_APPROVAL_MARKER } from "@/lib/self-approval-shared";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const { data } = await (await admin()).from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin").maybeSingle();
  return !!data;
}

async function reasonFor(key: string): Promise<string | null> {
  try {
    const raw = getRequestHeader(SELF_APPROVAL_HEADER);
    if (!raw) return null;
    const map = JSON.parse(decodeURIComponent(raw)) as Record<string, string>;
    const r = String(map[key] ?? "").trim();
    return r.length >= 10 ? r.slice(0, 1000) : null;
  } catch {
    return null;
  }
}

/**
 * Returns true when the caller is a Super Admin who gave a reason (override recorded).
 * Returns false for anyone else, so the caller keeps its normal second-person error.
 * Throws a reason prompt for a Super Admin who hasn't given a reason yet.
 */
export async function selfApprove(userId: string, action: string, recordIds: Array<string | null | undefined>): Promise<boolean> {
  if (!(await isSuperAdmin(userId))) return false;
  const ids = recordIds.filter((x): x is string => !!x);
  const key = `${action}:${ids[0] ?? "none"}`;
  const reason = await reasonFor(key);
  if (!reason) {
    throw new Error(`You're approving your own work. As a Super Admin you can, after you give a reason in the box that opened. Then click again. ${SELF_APPROVAL_MARKER}${key}]`);
  }
  const { error } = await (await admin()).from("self_approval_overrides").insert({ user_id: userId, action, record_ids: ids, reason });
  if (error) throw new Error("Could not record your self-approval reason.");
  return true;
}
