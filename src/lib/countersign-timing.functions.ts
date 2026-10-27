import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { COUNTERSIGN_TIMINGS, parseCountersignTiming } from "@/lib/countersign-timing";

async function assertManagerOrStaff(userId: string, offeringId: string) {
  const { onboardingActor } = await import("@/lib/investor-onboarding.server");
  const actor = await onboardingActor(userId);
  if (!actor.isStaff && !actor.managedOfferingIds.includes(offeringId)) throw new Error("Only this fund's managers or Harmonious can change this setting.");
  return actor;
}

export const getCountersignTimingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertManagerOrStaff(context.userId, data.offeringId);
    const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
    const [{ data: o }, { data: hist }] = await Promise.all([
      db.from("offerings").select("countersign_timing").eq("id", data.offeringId).maybeSingle(),
      db.from("offering_countersign_timing_events").select("previous_value, new_value, changed_at").eq("offering_id", data.offeringId).order("changed_at", { ascending: false }).limit(10),
    ]);
    return { timing: parseCountersignTiming(o?.countersign_timing), history: (hist ?? []) as { previous_value: string | null; new_value: string; changed_at: string }[] };
  });

export const setCountersignTimingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: z.string().uuid(), timing: z.enum(COUNTERSIGN_TIMINGS) }).parse)
  .handler(async ({ data, context }) => {
    await assertManagerOrStaff(context.userId, data.offeringId);
    const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
    const { data: o } = await db.from("offerings").select("countersign_timing").eq("id", data.offeringId).maybeSingle();
    if (!o) throw new Error("Fund not found.");
    if (o.countersign_timing === data.timing) return { ok: true };
    const { error } = await db.from("offerings").update({ countersign_timing: data.timing, updated_at: new Date().toISOString() }).eq("id", data.offeringId);
    if (error) throw new Error("Couldn't save this setting.");
    await db.from("offering_countersign_timing_events").insert({ offering_id: data.offeringId, previous_value: o.countersign_timing, new_value: data.timing, changed_by: context.userId });
    return { ok: true };
  });
