import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AttentionResult } from "@/lib/attention-model";
import type { WorkspaceKind } from "@/lib/session-resolution";

const KINDS: WorkspaceKind[] = ["investor", "fund_manager", "company", "professional", "operations"];

/**
 * Which workspaces this person genuinely belongs to, read from their own
 * relationship records. A workspace named by the browser is only honoured when
 * it appears here; anything else falls back to the first one they really hold.
 */
async function allowedWorkspaces(context: any): Promise<WorkspaceKind[]> {
  const { supabase, userId } = context;
  const [profiles, positions, managed, clients, companies, delegations, roles] = await Promise.all([
    supabase.from("investment_profiles").select("id").eq("owner_user_id", userId),
    supabase.from("investor_positions").select("id").eq("investor_user_id", userId),
    supabase.from("fund_managers").select("offering_id").eq("user_id", userId),
    supabase.from("client_users").select("client_id").eq("user_id", userId),
    supabase.from("cap_holder_access").select("client_id, revoked_at").eq("user_id", userId),
    supabase
      .from("delegations")
      .select("id")
      .eq("delegate_user_id", userId)
      .eq("status", "active"),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);

  const list: WorkspaceKind[] = [];
  const any = (r: any) => ((r?.data ?? []) as any[]).length > 0;
  if (any(profiles) || any(positions)) list.push("investor");
  if (any(managed)) list.push("fund_manager");
  if (any(clients) || ((companies?.data ?? []) as any[]).some((c) => !c.revoked_at)) {
    list.push("company");
  }
  if (any(delegations)) list.push("professional");
  if (any(roles)) list.push("operations");
  return list;
}

/**
 * The Action Center for the signed-in person.
 *
 * Nothing about scope is taken from the browser: the workspace is checked
 * against the person's real relationships before a single record is read, so a
 * hand-edited request returns their own work, never someone else's.
 */
export const getAttention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspace?: string } | undefined) => ({
    workspace: input?.workspace ? String(input.workspace) : null,
  }))
  .handler(async ({ data, context }): Promise<AttentionResult | { workspace: null; groups: null }> => {
    const allowed = await allowedWorkspaces(context);
    const requested = KINDS.find((k) => k === data.workspace) ?? null;
    const workspace = requested && allowed.includes(requested) ? requested : (allowed[0] ?? null);

    if (!workspace) {
      return { workspace: null, groups: null };
    }

    const { attentionFor } = await import("@/lib/attention.server");
    return attentionFor({ userId: context.userId, supabase: context.supabase }, workspace);
  });
