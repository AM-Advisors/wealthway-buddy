import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  capabilitiesFor,
  opsNavigation,
  type OpsArea,
  type OpsAction,
  type OpsCapability,
} from "@/lib/ops-capabilities";

/**
 * Use at the top of any Operations server function. Entry comes from an active
 * staff role record, never from an email address, a hostname or the menu.
 */
export async function requireOperations(
  context: any,
  area?: OpsArea,
  action: OpsAction = "see",
): Promise<{ roles: string[]; capabilities: OpsCapability[] }> {
  const { gatherStaffFacts } = await import("@/lib/session-facts.server");
  const staff = await gatherStaffFacts(context);
  const roles = staff.roles;
  if (!staff.operationsEntry) throw new Error("Forbidden: Harmonious team access only.");
  const capabilities = staff.capabilities;
  if (area && !capabilities.includes(`${area}:${action}` as OpsCapability)) {
    throw new Error("Forbidden: you don't have that permission.");
  }
  return { roles, capabilities };
}

/** Who this staff member is and which Operations sections they may open. */
export const getOperationsContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { gatherStaffFacts } = await import("@/lib/session-facts.server");
    const staff = await gatherStaffFacts(context);
    const roles = staff.roles;
    if (!staff.operationsEntry) {
      return { staff: false, roles: [], capabilities: [], sections: [] } as const;
    }
    const capabilities = staff.capabilities;
    return {
      staff: true,
      roles: roles.filter((r) => capabilitiesFor([r]).length > 0),
      capabilities,
      sections: opsNavigation(capabilities),
    };
  });
