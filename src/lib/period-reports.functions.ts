import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";

/** Published, manager-visible fund financial reports for the quarterly / yearly
 *  downloads. Staff read a chosen client's funds; fund managers read only the
 *  funds they manage. Other client users get none. */
export const listPeriodFundReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ clientId: z.string().uuid().optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { reviewerScope } = await import("@/lib/reviewer-authz.server");
    let scope;
    try {
      scope = await reviewerScope(context.userId);
    } catch {
      return { funds: [], reports: [] };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    let fundIds: string[];
    if (scope.isAdmin) {
      if (!data.clientId) return { funds: [], reports: [] };
      const { data: rows } = await db.from("offerings").select("id").eq("client_id", data.clientId);
      fundIds = ((rows ?? []) as { id: string }[]).map((r) => r.id);
    } else {
      fundIds = scope.offeringIds;
    }
    if (fundIds.length === 0) return { funds: [], reports: [] };
    const [{ data: reports }, { data: funds }] = await Promise.all([
      db
        .from("financial_reports")
        .select("id, offering_id, report_type, period_start, period_end, version, payload, published_at")
        .in("offering_id", fundIds)
        .eq("manager_visible", true)
        .eq("status", "published")
        .order("period_end", { ascending: false }),
      db.from("offerings").select("id, name").in("id", fundIds),
    ]);
    return {
      funds: (funds ?? []) as { id: string; name: string }[],
      reports: (reports ?? []) as any[],
    };
  });
