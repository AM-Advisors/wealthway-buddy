import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "./require-auth";
export const saveFundReviewOwnerFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ fundId: z.string().uuid(), userId: z.string().uuid().nullable() }).parse)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const { data: manager } = await context.supabase.from("fund_managers").select("id").eq("user_id", context.userId).eq("offering_id", data.fundId).maybeSingle();
    if (!manager && !(roles ?? []).some(r => ["admin", "super_admin"].includes(r.role))) throw new Error("Only this fund's manager may choose the review email owner.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (data.userId) {
      const { data: recipientManager } = await db.from("fund_managers").select("id").eq("user_id", data.userId).eq("offering_id", data.fundId).maybeSingle();
      if (!recipientManager && !(await (await import("./fund-routine-access.server")).routineReviewer(db, data.userId, data.fundId))) throw new Error("Choose this fund's manager or a designated reviewer.");
    }
    const { error } = await db.from("offerings").update({ routine_review_user_id: data.userId, routine_review_changed_by: context.userId }).eq("id", data.fundId);
    if (error) throw new Error("Review email owner could not be saved.");
    return { ok: true };
  });