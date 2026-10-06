import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { can, capabilitiesFor } from "@/lib/ops-capabilities";

/** Read-only fund launch steps (same Fund Setup tasks + launch conditions) for staff and that fund's managers. */
export const getFundLaunchSteps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().uuid() }).parse)
  .handler(async ({ context, data }) => {
    const { data: roleRows } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const roles = (roleRows ?? []).map((r: any) => String(r.role));
    const isStaff = can(capabilitiesFor(roles), "funds", "see");
    if (!isStaff) {
      const { data: m } = await context.supabase.from("fund_managers").select("offering_id").eq("user_id", context.userId).eq("offering_id", data.offeringId).limit(1);
      if (!m?.length) throw new Error("Not available for this fund.");
    }
    const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const { data: setup } = await db.from("fund_setups").select("id,launch_state").eq("offering_id", data.offeringId).maybeSingle();
    if (!setup) return { hasSetup: false, isStaff, launchState: null, tasks: [], conditions: [] };
    const [{ data: tasks }, { data: conditions }] = await Promise.all([
      db.from("fund_setup_tasks").select("id,label,status,blocking").eq("setup_id", setup.id).order("sort_order"),
      db.from("fund_launch_conditions").select("id,label,required,satisfied").eq("setup_id", setup.id).order("sort_order"),
    ]);
    return {
      hasSetup: true, isStaff, launchState: setup.launch_state as string | null,
      tasks: (tasks ?? []).filter((t: any) => t.blocking).map((t: any) => ({ id: t.id as string, label: t.label as string, status: t.status as string })),
      conditions: (conditions ?? []).filter((c: any) => c.required).map((c: any) => ({ id: c.id as string, label: c.label as string, satisfied: Boolean(c.satisfied) })),
    };
  });
