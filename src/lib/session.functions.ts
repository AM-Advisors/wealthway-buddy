import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { safeInternalPath } from "@/lib/app-origins";
import {
  availableWorkspaces,
  canEnterWorkspace,
  hasOperationsAccess,
  resolveDestination,
} from "@/lib/session-resolution";
import {
  adminAccessProjection,
  gatherFacts,
  operationsAccessProjection,
  professionalStandingProjection,
} from "@/lib/session-facts.server";

/**
 * The one answer to "who is this, what may they enter, and where do they go?".
 * Every sign-in page and the workspace switcher call this; none of them decide
 * anything themselves.
 */
export const resolveSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { intended?: string | null } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const facts = await gatherFacts(context);
    const intended = data.intended ? safeInternalPath(data.intended, "") : "";
    const workspaces = availableWorkspaces(facts);
    const destination = resolveDestination(facts, intended || null);

    return {
      person: { userId: context.userId, name: facts.name, email: facts.email },
      operations: hasOperationsAccess(facts),
      staffRoles: facts.staff.roles,
      // Granular Operations permissions, never collapsed into a single flag.
      operationsCapabilities: facts.operations.capabilities,
      // Navigation flags for the legacy internal menu — projections of the same
      // facts, so no menu ever runs its own relationship query.
      navigation: {
        isAdmin: adminAccessProjection(facts).isAdmin,
        isReviewer: adminAccessProjection(facts).isReviewer,
        legacyOperationsAllowed: operationsAccessProjection(facts.operations).allowed,
        isProfessional: professionalStandingProjection(facts).isProfessional,
      },
      workspaces,
      pendingInvitations: facts.pendingInvitationCount,
      outstandingRequirements: facts.outstandingRequirements,
      destination: destination.path,
      destinationReason: destination.reason,
    };
  });

/**
 * Switching workspace re-resolves authority on the server. The identifier the
 * browser sends is checked against the person's real relationships, so changing
 * it by hand cannot grant access to anything.
 */
export const enterWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) => {
    if (!input?.workspaceId) throw new Error("Choose a workspace.");
    return { workspaceId: String(input.workspaceId) };
  })
  .handler(async ({ data, context }) => {
    const facts = await gatherFacts(context);
    if (!canEnterWorkspace(facts, data.workspaceId)) {
      throw new Error("You don't have access to that workspace.");
    }
    const workspace = availableWorkspaces(facts).find((w) => w.id === data.workspaceId)!;
    // The client must drop anything remembered from the previous workspace.
    return {
      path: workspace.path,
      surface: workspace.surface,
      label: workspace.label,
      kind: workspace.kind,
      clearClientContext: true as const,
    };
  });
