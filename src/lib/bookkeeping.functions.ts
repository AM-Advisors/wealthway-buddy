import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import proposed from "@/lib/config/bookkeeping-proposed.json";
import { bookkeepingConfigSchema } from "@/lib/bookkeeping-model";

export const getBookkeepingConfiguration = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { whoIsStaff } = await import("@/lib/service-catalog.functions");
  const who = await whoIsStaff(context);
  const { salesScope } = await import("@/lib/sales-model");
  if (!who.isStaff && salesScope(who.roles) === "none") throw new Error("Harmonious staff access is required.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("bookkeeping_config_versions").select("id,configuration,effective_on,created_at,reason").order("created_at", { ascending: false }).limit(30);
  if (error) throw new Error("Couldn't load proposed bookkeeping configuration.");
  const latest = data?.[0];
  return { canManage: who.roles.some(r => ["executive", "cro", "super_admin"].includes(r)), versions: data ?? [], versionId: latest?.id ?? null, effectiveOn: latest?.effective_on ?? "", configuration: bookkeepingConfigSchema.parse(latest?.configuration ?? proposed) };
});

export const saveBookkeepingConfiguration = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ configuration: bookkeepingConfigSchema, effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().min(3).max(1000) }))
  .handler(async ({ context, data }) => {
    const { data: roles, error: roleError } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (roleError || !roles?.some(r => ["executive", "cro", "super_admin"].includes(r.role))) throw new Error("Proposed rate changes require CEO, CRO or Super Administrator authority.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: saved, error } = await supabaseAdmin.from("bookkeeping_config_versions").insert({ configuration: JSON.parse(JSON.stringify(data.configuration)), effective_on: data.effectiveOn, reason: data.reason, created_by: context.userId }).select("id").single();
    if (error || !saved) throw new Error("Couldn't save the proposed configuration.");
    return { id: saved.id };
  });