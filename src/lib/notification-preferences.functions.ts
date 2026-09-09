import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Whether the signed-in reviewer receives fund alert emails. Defaults to on. */
export const getAlertPreference = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("notification_preferences")
      .select("alerts_enabled")
      .eq("user_id", userId)
      .maybeSingle();

    return { alertsEnabled: data?.alerts_enabled ?? true };
  });

export const setAlertPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ alertsEnabled: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("notification_preferences")
      .upsert(
        { user_id: userId, alerts_enabled: data.alertsEnabled, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);

    return { ok: true, alertsEnabled: data.alertsEnabled };
  });
