import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AttentionResult } from "@/lib/attention-model";
import type { WorkspaceKind } from "@/lib/session-resolution";

const KINDS: WorkspaceKind[] = ["investor", "fund_manager", "company", "professional", "operations"];

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
    const { gatherFacts, attentionWorkspaces } = await import("@/lib/session-facts.server");
    const allowed = attentionWorkspaces(await gatherFacts(context));
    const requested = KINDS.find((k) => k === data.workspace) ?? null;
    const workspace = requested && allowed.includes(requested) ? requested : (allowed[0] ?? null);

    if (!workspace) {
      return { workspace: null, groups: null };
    }

    const { attentionFor } = await import("@/lib/attention.server");
    return attentionFor({ userId: context.userId, supabase: context.supabase }, workspace);
  });
