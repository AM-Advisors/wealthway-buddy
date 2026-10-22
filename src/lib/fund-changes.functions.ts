import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { fundEditKeys, pendingFundChanges } from "@/lib/fund-change-model";

export const getFundChanges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ fundId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { isStaff } = await import("@/lib/fund-tabs.server");
    const staff = await isStaff(context.userId);
    const { data: manager, error: managerError } = await context.supabase.from("fund_managers").select("id").eq("user_id", context.userId).eq("offering_id", data.fundId).maybeSingle();
    if (managerError) throw new Error("Fund access could not be checked.");
    if (!staff && !manager) throw new Error("Only this fund's managers and Harmonious can review fund changes.");
    const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
    let requests = db.from("fund_service_requests").select("id,status,created_at").eq("fund_id", data.fundId).not("status", "in", "(DRAFT,COMPLETED,CANCELLED)").limit(100);
    if (!staff) requests = requests.eq("client_visibility", true);
    const results = await Promise.all([
      db.from("fund_fee_terms").select("id,status,created_at").eq("offering_id", data.fundId).eq("status", "pending_approval"),
      db.from("side_letter_change_requests").select("id,status,created_at").eq("offering_id", data.fundId).eq("status", "pending"),
      db.from("locked_edit_requests").select("id,status,created_at").in("resource_key", fundEditKeys(data.fundId)).eq("status", "pending"),
      requests,
      db.from("notification_events").select("id,field,created_at").eq("offering_id", data.fundId).eq("event_kind", "client_work_update").order("created_at", { ascending: false }).limit(8),
    ]);
    if (results.some(r => r.error)) throw new Error("Fund requests and updates could not be loaded. Please try again.");
    return { staff, pending: pendingFundChanges({ fees: results[0].data ?? [], letters: results[1].data ?? [], edits: results[2].data ?? [], requests: results[3].data ?? [] }), updates: (results[4].data ?? []).map((r: any) => ({ id: r.id as string, title: r.field === "approval_required" ? "Client approval requested" : r.field === "information_required" ? "Information requested" : r.field === "request_completed" ? "Request completed" : "Fund request updated", at: r.created_at as string })) };
  });