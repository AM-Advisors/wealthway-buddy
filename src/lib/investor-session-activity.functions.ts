import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

/** Staff-only: the investor's recorded sign-ins and in-app actions (security_events). Recorded evidence only, never live presence. */
export const investorSessionActivityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ onboardingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertStaff } = await import("@/lib/investor-onboarding.server");
    await assertStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: ob } = await db.from("investor_onboardings").select("investor_user_id").eq("id", data.onboardingId).maybeSingle();
    if (!ob?.investor_user_id) return { hasAccount: false, events: [] as any[] };
    const { data: rows } = await db.from("security_events")
      .select("id, event_type, action, path, ip, city, region, country, user_agent, session_id, created_at")
      .eq("user_id", ob.investor_user_id).order("created_at", { ascending: false }).limit(300);
    return { hasAccount: true, events: (rows ?? []) as Array<{ id: string; event_type: string; action: string | null; path: string | null; ip: string | null; city: string | null; region: string | null; country: string | null; user_agent: string | null; session_id: string | null; created_at: string }> };
  });
