/**
 * Effective Harmonious staff capabilities: legacy role baseline + assigned
 * predefined/custom roles + direct grants. Called only after the caller has
 * already passed the Operations staff check (never email-domain based).
 */
import { staffCapabilitiesFor, type StaffCapability } from "@/lib/contract-coverage";

export async function loadStaffCapabilities(userId: string, roles: readonly string[]): Promise<StaffCapability[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: grants } = await db
    .from("staff_capability_grants")
    .select("capability, role_key")
    .eq("user_id", userId)
    .is("revoked_at", null);
  const rows = (grants ?? []) as { capability: string | null; role_key: string | null }[];
  const roleKeys = rows.map((r) => r.role_key).filter(Boolean) as string[];
  let customRoles: Record<string, string[]> = {};
  if (roleKeys.length) {
    const { data: custom } = await db.from("staff_custom_roles").select("role_key, capabilities").in("role_key", roleKeys).eq("active", true);
    customRoles = Object.fromEntries(((custom ?? []) as any[]).map((c) => [c.role_key, c.capabilities ?? []]));
  }
  return staffCapabilitiesFor({
    roles,
    assignedRoleKeys: roleKeys,
    customRoles,
    grants: rows.map((r) => r.capability).filter(Boolean) as string[],
  });
}
