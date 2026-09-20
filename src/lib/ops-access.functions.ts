import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  capabilitiesFor,
  hasOperationsEntry,
  opsNavigation,
  type OpsArea,
  type OpsAction,
  type OpsCapability,
} from "@/lib/ops-capabilities";

/** The roles recorded for the signed-in person, from the role records only. */
async function rolesOf(context: any): Promise<string[]> {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}

/**
 * Use at the top of any Operations server function. Entry comes from an active
 * staff role record, never from an email address, a hostname or the menu.
 */
export async function requireOperations(
  context: any,
  area?: OpsArea,
  action: OpsAction = "see",
): Promise<{ roles: string[]; capabilities: OpsCapability[] }> {
  const roles = await rolesOf(context);
  if (!hasOperationsEntry(roles)) throw new Error("Forbidden: Harmonious team access only.");
  const capabilities = capabilitiesFor(roles);
  if (area && !capabilities.includes(`${area}:${action}` as OpsCapability)) {
    throw new Error("Forbidden: you don't have that permission.");
  }
  return { roles, capabilities };
}

/** Who this staff member is and which Operations sections they may open. */
export const getOperationsContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await rolesOf(context);
    if (!hasOperationsEntry(roles)) {
      return { staff: false, roles: [], capabilities: [], sections: [] } as const;
    }
    const capabilities = capabilitiesFor(roles);
    return {
      staff: true,
      roles: roles.filter((r) => capabilitiesFor([r]).length > 0),
      capabilities,
      sections: opsNavigation(capabilities),
    };
  });
