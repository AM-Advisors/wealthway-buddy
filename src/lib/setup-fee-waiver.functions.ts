import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Only pricing approvers (CEO, CRO, Super Admin) may waive or restore the setup fee. */
async function callerCanWaive(context: any): Promise<boolean> {
  const { PRICE_APPROVER_ROLES } = await import("@/lib/fund-payments.server");
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  return ((data ?? []) as { role: string }[]).some((r) => PRICE_APPROVER_ROLES.includes(r.role));
}

export const getSetupFeeWaiver = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireOperations } = await import("@/lib/ops-access.functions");
    await requireOperations(context, "clients", "see");
    const db = await admin();
    const { data: rows, error } = await db.from("client_setup_fee_waivers")
      .select("id, reason, granted_by, granted_at, revoked_at, revoked_by, revoke_reason")
      .eq("client_id", data.clientId).order("granted_at", { ascending: false }).limit(20);
    if (error) throw new Error("Setup fee settings could not be loaded.");
    const ids = Array.from(new Set((rows ?? []).flatMap((r: any) => [r.granted_by, r.revoked_by]).filter(Boolean)));
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: p } = await db.from("profiles").select("id, legal_name, email").in("id", ids);
      for (const x of p ?? []) names.set(String(x.id), x.legal_name || x.email || "Harmonious");
    }
    const history = (rows ?? []).map((r: any) => ({
      id: String(r.id), reason: String(r.reason), grantedBy: names.get(String(r.granted_by)) ?? "Harmonious", grantedAt: String(r.granted_at),
      revokedAt: r.revoked_at ? String(r.revoked_at) : null, revokedBy: r.revoked_by ? names.get(String(r.revoked_by)) ?? "Harmonious" : null, revokeReason: r.revoke_reason ?? null,
    }));
    return { waived: history.some((h: { revokedAt: string | null }) => !h.revokedAt), history, canChange: await callerCanWaive(context) };
  });

export const setSetupFeeWaiver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid(), waive: z.boolean(), reason: z.string().trim().min(3).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireOperations } = await import("@/lib/ops-access.functions");
    await requireOperations(context, "clients", "see");
    if (!(await callerCanWaive(context))) throw new Error("Only the CEO, CRO or a Super Admin can change the setup fee.");
    const db = await admin();
    if (data.waive) {
      const { error } = await db.from("client_setup_fee_waivers").insert({ client_id: data.clientId, reason: data.reason, granted_by: context.userId });
      if (error) throw new Error(error.code === "23505" ? "This client already has the setup fee waived." : "The waiver could not be saved.");
    } else {
      const { data: rows, error } = await db.from("client_setup_fee_waivers")
        .update({ revoked_at: new Date().toISOString(), revoked_by: context.userId, revoke_reason: data.reason })
        .eq("client_id", data.clientId).is("revoked_at", null).select("id");
      if (error) throw new Error("The waiver could not be removed.");
      if (!rows?.length) throw new Error("This client doesn't have the setup fee waived.");
    }
    return { ok: true };
  });
