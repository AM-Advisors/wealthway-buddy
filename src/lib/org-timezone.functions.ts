import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

export const getOrgTimezone = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any).from("marketing_org_settings").select("timezone").eq("id", 1).maybeSingle();
    return { timezone: (data?.timezone as string) ?? "America/Chicago" };
  });

export const setOrgTimezone = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ timezone: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const { isValidTz } = await import("@/lib/org-timezone");
    if (!isValidTz(data.timezone)) throw new Error("Unknown time zone.");
    const { requireMarketing } = await import("@/lib/marketing.server");
    const { db, canApprove } = await requireMarketing(context.userId);
    if (!canApprove) throw new Error("Only a marketing manager can change the organization time zone.");
    await db.from("marketing_org_settings").update({ timezone: data.timezone, updated_by: context.userId, updated_at: new Date().toISOString() }).eq("id", 1);
  });
