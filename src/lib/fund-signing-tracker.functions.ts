import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
const scope = z.object({ fundId: z.string().uuid() });
async function trackerAccess(userId: string, fundId: string) {
  const s = await import("@/lib/fund-tabs.server");
  const access = await s.assertFund(userId, fundId);
  const d = await s.db();
  const manager = await d.from("fund_managers").select("id").eq("offering_id", fundId).eq("user_id", userId).maybeSingle();
  return { d, canLog: access.staff || Boolean(manager.data) };
}
export const signingTrackerLogsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(scope.parse).handler(async ({ data, context }) => {
    const { d, canLog } = await trackerAccess(context.userId, data.fundId);
    const r = await d.from("offering_audit_events").select("id,summary,changes,created_at,actor_id")
      .eq("offering_id", data.fundId).eq("event_type", "document_signing_manual_log").order("created_at", { ascending: false }).limit(200);
    if (r.error) throw new Error("Signing logs could not be loaded.");
    return { canLog, logs: (r.data ?? []).map((row: any) => {
      const value = (key: string) => row.changes?.find((c: any) => c.field === key)?.to ?? "";
      return { id: row.id, fileId: value("fileId"), signerUserId: value("signerUserId"), status: value("status"), date: value("date"), note: value("note"), at: row.created_at };
    }) };
  });
export const logSigningTrackerFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(scope.extend({ fileId: z.string().uuid(), signerUserId: z.string().uuid(), status: z.enum(["pending", "signed"]), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().trim().min(3).max(500) }).parse)
  .handler(async ({ data, context }) => {
    const { d, canLog } = await trackerAccess(context.userId, data.fundId);
    if (!canLog) throw new Error("Only Harmonious or this fund's managers can log signing updates.");
    const [file, manager] = await Promise.all([
      d.from("fund_files").select("id,title").eq("id", data.fileId).eq("offering_id", data.fundId).is("deleted_at", null).maybeSingle(),
      d.from("fund_managers").select("id").eq("offering_id", data.fundId).eq("user_id", data.signerUserId).maybeSingle(),
    ]);
    if (file.error || manager.error || !file.data || !manager.data) throw new Error("Choose a document and manager belonging to this fund.");
    const { fundId, ...values } = data;
    const r = await d.from("offering_audit_events").insert({ offering_id: fundId, event_type: "document_signing_manual_log", actor_id: context.userId,
      summary: `Manual signing update: ${file.data.title} · ${data.status === "signed" ? "reported signed" : "pending"}`,
      changes: Object.entries(values).map(([field, to]) => ({ field, to })) });
    if (r.error) throw new Error("Signing update could not be saved.");
    return { ok: true };
  });