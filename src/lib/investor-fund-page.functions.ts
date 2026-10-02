import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const offering = z.object({ offeringId: z.string().uuid() });

/** Journey + funding facts for one fund on the investor's fund page. */
export const investorFundStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offering.parse)
  .handler(async ({ data, context }) => {
    const onboarding = await import("@/lib/investor-onboarding.server");
    const status = await onboarding.investorFundStatus(context.userId, data.offeringId);
    if (!status) return null;

    // Unread replies from the fund team on this investor's private thread.
    let unreadFromTeam = 0;
    if (status.applicationId) {
      const { count } = await context.supabase
        .from("portal_messages")
        .select("id", { count: "exact", head: true })
        .eq("application_id", status.applicationId)
        .neq("sender_role", "investor")
        .is("read_at", null);
      unreadFromTeam = count ?? 0;
    }
    return { ...status, unreadFromTeam };
  });

/** This investor's capital calls for one fund (published/closed only). */
export const myFundCapitalCallsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offering.parse)
  .handler(async ({ data, context }) => {
    const calls = await (await import("@/lib/capital-calls.server")).myCapitalCalls(context.userId);
    return (calls as any[]).filter((c) => c.offeringId === data.offeringId);
  });

/** The investor's delivered K-1s for one fund (RLS limits to their own). */
export const myFundK1sFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offering.parse)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("k1_forms")
      .select(
        "id, tax_year, status, delivered_at, storage_path, boxes, tax_capital, investor_acknowledged_at",
      )
      .eq("investor_user_id", context.userId)
      .eq("offering_id", data.offeringId)
      .in("status", ["delivered"])
      .order("tax_year", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

/** The investor confirms they received this K-1. A record, never an email. */
export const acknowledgeK1Fn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ k1Id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("k1_forms")
      .update({
        investor_acknowledged_at: new Date().toISOString(),
        investor_acknowledged_by: context.userId,
      })
      .eq("id", data.k1Id)
      .eq("investor_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
