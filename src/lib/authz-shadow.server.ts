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

/**
 * Stage 3A.1: shadow the two Operations read functions. Returns nothing the
 * caller uses; legacy has already decided. Failures are swallowed.
 */
export async function shadowOperations(endpoint: "getOperationsAccess" | "listOperationsTeam", userId: string, legacyAllowed: boolean): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { canonicalOperationsEntry, canonicalOperationsTeam } = await import("@/lib/authz-ops-shadow");
    const { shadowRecordFor } = await import("@/lib/authz-shadow");
    const db = supabaseAdmin as any;
    const [{ data: u }, { data: roles }, { data: assignments }] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(userId),
      db.from("user_roles").select("role").eq("user_id", userId),
      db.from("access_role_assignments").select("id, role_key, role_version, scope_type, scope_id, effective_at, expires_at, revoked_at").eq("user_id", userId),
    ]);
    const user: any = u?.user;
    const facts = {
      authenticated: !!user,
      suspended: !user || !!user.deleted_at || (!!user.banned_until && Date.parse(user.banned_until) > Date.now()),
      platformRoles: ((roles ?? []) as any[]).map((r) => String(r.role)),
      assignments: (assignments ?? []) as any[],
    };
    const canonical = endpoint === "getOperationsAccess" ? canonicalOperationsEntry(facts) : canonicalOperationsTeam(facts);
    await db.from("authz_shadow_events").insert(shadowRecordFor({ endpoint: `operations.functions.ts::${endpoint}`, actorUserId: userId, legacyAllowed, canonical }));
  } catch {
    /* best-effort */
  }
}
