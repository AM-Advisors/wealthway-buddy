import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";

/**
 * Records a Super Admin's written reason for approving their own work. The row
 * is append-only and honoured for 5 minutes by selfApprove and the database
 * segregation-of-duties triggers. Non Super Admins get nothing.
 */
export const recordSelfApprovalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ key: z.string().trim().min(3).max(300), reason: z.string().trim().min(10, "Give a reason (at least 10 characters).").max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as any).userId as string;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: role } = await db.from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin").maybeSingle();
    if (!role) throw new Error("Only a Super Admin can approve their own work.");
    const i = data.key.lastIndexOf(":");
    const action = data.key.slice(0, i);
    const record = data.key.slice(i + 1);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record);
    const { error } = await db.from("self_approval_overrides").insert({ user_id: userId, action, record_ids: isUuid ? [record] : [], reason: data.reason });
    if (error) throw new Error("Could not record your self-approval reason.");
    return { ok: true };
  });
