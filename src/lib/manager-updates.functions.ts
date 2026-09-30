import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KINDS = ["fund_assigned", "setup_task_progress", "service_progress", "launch_progress"] as const;

export type FundUpdate = { id: string; offeringId: string; fundName: string; headline: string; intro: string; at: string; path: string };

/**
 * Fund Setup progress feed for the signed-in fund manager: only Funds they are
 * assigned to, only status wording (no notes, evidence or internal detail).
 */
export const listFundUpdates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid().optional(), limit: z.number().int().min(1).max(50).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: mine } = await supabase.from("fund_managers").select("offering_id").eq("user_id", userId);
    let ids = ((mine ?? []) as { offering_id: string }[]).map((m) => m.offering_id);
    if (data.offeringId) ids = ids.filter((i) => i === data.offeringId);
    if (ids.length === 0) return [] as FundUpdate[];

    // Scoped to the caller's own assignments above; the outbox itself is not client-readable.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: rows }, { data: funds }] = await Promise.all([
      supabaseAdmin
        .from("notification_events")
        .select("id, event_kind, offering_id, field, old_value, new_value, metadata, created_at")
        .in("offering_id", ids)
        .in("event_kind", KINDS as unknown as string[])
        .order("created_at", { ascending: false })
        .limit(data.limit ?? 20),
      supabaseAdmin.from("offerings").select("id, name").in("id", ids),
    ]);
    const names = new Map(((funds ?? []) as { id: string; name: string }[]).map((f) => [f.id, f.name]));
    const { fundProgressMessage } = await import("@/lib/manager-alerts.server");

    return ((rows ?? []) as any[])
      // An assignment note is only for the person who was assigned.
      .filter((r) => r.event_kind !== "fund_assigned" || r.metadata?.recipient_user_id === userId)
      .map((r) => {
        const fundName = names.get(r.offering_id) ?? "Your fund";
        const msg = fundProgressMessage(r, fundName);
        return {
          id: r.id as string,
          offeringId: r.offering_id as string,
          fundName,
          headline: msg?.headline ?? "Fund update",
          intro: msg?.intro ?? "",
          at: r.created_at as string,
          path: `/manager/fund/${r.offering_id}`,
        };
      }) as FundUpdate[];
  });
