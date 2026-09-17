/**
 * Phase 3A server functions — the professional workspace (read-only).
 *
 * No function here writes client data. Each one re-resolves the delegation and
 * runs the centralized authorization decision against the real resource, so a
 * stale browser cache, a swapped id or a revoked grant can never be used.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const delegationInput = z.object({ delegation_id: z.string().uuid() });

/** Is this person a professional at all, and at which firms? */
export const getProfessionalStanding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [{ data: seats }, { data: held }] = await Promise.all([
      supabase
        .from("professional_memberships")
        .select("id, organization_id, seat_role, status, professional_organizations(name, org_type)")
        .eq("user_id", userId),
      supabase.from("delegations").select("id, status").eq("delegate_user_id", userId),
    ]);

    const memberships = ((seats ?? []) as any[]).map((m) => ({
      id: m.id,
      organizationId: m.organization_id,
      organizationName: m.professional_organizations?.name ?? null,
      organizationType: m.professional_organizations?.org_type ?? null,
      seatRole: m.seat_role,
      status: m.status,
    }));

    const activeDelegations = ((held ?? []) as any[]).filter((d) => d.status === "active").length;

    return {
      // Membership alone reveals no client data — it only opens the workspace.
      isProfessional: memberships.some((m) => m.status === "active") || activeDelegations > 0,
      memberships,
      activeDelegations,
    };
  });

/** The consolidated client list, derived only from live delegations. */
export const listMyProfessionalClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listDelegatedClients } = await import("@/lib/professional-access.server");
    return { clients: await listDelegatedClients(context.userId) };
  });

/** Everything one delegation permits, section by section. */
export const getDelegatedClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => delegationInput.parse(data))
  .handler(async ({ data, context }) => {
    const { buildDelegatedClientView } = await import("@/lib/professional-access.server");
    const view = await buildDelegatedClientView(context.userId, data.delegation_id);
    if (!view) throw new Error("That delegated access is no longer available.");
    return view;
  });

/** Every live delegation's view at once, for the cross-client workspace tabs. */
export const getProfessionalOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listDelegatedClients, buildDelegatedClientView } = await import(
      "@/lib/professional-access.server"
    );
    const clients = await listDelegatedClients(context.userId);
    const views: any[] = [];
    for (const client of clients) {
      const view = await buildDelegatedClientView(context.userId, client.delegationId);
      if (view) views.push(view);
    }
    return { clients, views };
  });

/** Audit trail for one delegation. */
export const getDelegationActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => delegationInput.parse(data))
  .handler(async ({ data, context }) => {
    const { delegationActivity } = await import("@/lib/professional-access.server");
    return { events: await delegationActivity(context.userId, data.delegation_id) };
  });
