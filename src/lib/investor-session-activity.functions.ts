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
    const { data: ob } = await db.from("investor_onboardings").select("investor_user_id, person_id, persons(email, secondary_email)").eq("id", data.onboardingId).maybeSingle();
    const { loadOutsideAccountEvents } = await import("@/lib/person-activity-timeline.server");
    const { attachClicksToSessions } = await import("@/lib/person-activity-timeline");
    const emails = [ob?.persons?.email, ob?.persons?.secondary_email].filter(Boolean) as string[];
    const outside = ob ? await loadOutsideAccountEvents(db, { emails, onboardingIds: [data.onboardingId] }) : [];
    type Row = { id: string; event_type: string; action: string | null; path: string | null; ip: string | null; city: string | null; region: string | null; country: string | null; user_agent: string | null; session_id: string | null; created_at: string };
    if (!ob?.investor_user_id) return { hasAccount: false, events: [] as (Row & { place: string | null; timeZone: string | null; localWhen: string | null })[], outside };
    const [{ data: rows }, { data: clicks }] = await Promise.all([
      db.from("security_events")
        .select("id, event_type, action, path, ip, city, region, country, user_agent, session_id, created_at")
        .eq("user_id", ob.investor_user_id).neq("event_type", "heartbeat").neq("event_type", "page_view").order("created_at", { ascending: false }).limit(300),
      db.from("staff_activity_events").select("id, kind, path, label, created_at").eq("user_id", ob.investor_user_id).order("created_at", { ascending: false }).limit(500),
    ]);
    const events = attachClicksToSessions((rows ?? []) as Row[], (clicks ?? []) as any[]) as Row[];
    // Approximate address and the investor's own local time, from each row's IP.
    const { locate } = await import("@/lib/ip-geo");
    const { placesForIps } = await import("@/lib/ip-geo.server");
    const places = await placesForIps(db, events.map((e) => e.ip), 20);
    return { hasAccount: true, events: events.map((e) => ({ ...e, ...locate(e.created_at, e.ip, places) })), outside };
  });
