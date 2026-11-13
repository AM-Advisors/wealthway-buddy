/**
 * The older investor funding and signing pages (/fund/$offeringId/funding, /documents)
 * reads the older application row. When the investor already has a current
 * investment record for that fund, the page sends them to it instead, so they
 * see the same status Operations sees. Read-only; scoped to the caller's own rows.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { preferredOnboarding } from "@/lib/legacy-application-supersede";

export const currentInvestmentForFund = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ offeringId: z.string().uuid().nullable().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let offeringId = data.offeringId ?? null;
    if (!offeringId) {
      const { activeApplicationId } = await import("@/lib/active-application");
      const { data: app } = await supabase
        .from("investor_applications")
        .select("offering_id")
        .eq("user_id", userId)
        .eq("id", await activeApplicationId(supabase, userId))
        .maybeSingle();
      offeringId = ((app as any)?.offering_id as string | undefined) ?? null;
    }
    if (!offeringId) return { onboardingId: null as string | null };
    const { data: rows } = await supabase
      .from("investor_onboardings")
      .select("id, stage, closed_at, updated_at")
      .eq("investor_user_id", userId)
      .eq("offering_id", offeringId)
      .limit(50);
    const pick = preferredOnboarding((rows ?? []) as any[]);
    return { onboardingId: (pick?.id as string | undefined) ?? null };
  });
