import type { AuthzFacts, Resource } from "@/lib/authorize";
import { shadowCompare } from "@/lib/authz-shadow";

/**
 * Non-enforcing shadow check for Stage 3 cutovers. Always returns the legacy
 * decision; logging failures never change the outcome.
 */
export async function shadowAuthorize(args: { endpoint: string; legacyAllowed: boolean; facts: AuthzFacts; permission: string; resource: Resource }): Promise<boolean> {
  const { allowed, record } = shadowCompare(args);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("authz_shadow_events").insert(record);
  } catch {
    /* shadow logging is best-effort */
  }
  return allowed;
}
