import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
// Money, banking and account changes need a fully cleared identity check (not "limited" review access).
import { requireFullyVerifiedAuth as requireSupabaseAuth } from "@/lib/require-auth";
import { normalizePaymentMethods, PAYMENT_METHODS } from "@/lib/payment-methods";

/** Staff (admin/super_admin) or a manager of this fund may choose its accepted payment methods. */
async function assertCanEdit(supabase: any, userId: string, offeringId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if ((roles ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin")) return;
  const { data: m } = await supabase.from("fund_managers").select("offering_id").eq("user_id", userId).eq("offering_id", offeringId).maybeSingle();
  if (!m) throw new Error("Only Harmonious staff or this fund's managers can change payment methods.");
}

export const getPaymentMethodsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offering_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertCanEdit(context.supabase, context.userId, data.offering_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: o } = await (supabaseAdmin as any).from("offerings").select("payment_methods, check_payable_to, check_mail_address").eq("id", data.offering_id).maybeSingle();
    return { methods: normalizePaymentMethods(o?.payment_methods), checkPayableTo: o?.check_payable_to ?? "", checkMailAddress: o?.check_mail_address ?? "" };
  });

export const savePaymentMethodsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      offering_id: z.string().uuid(),
      methods: z.array(z.enum(PAYMENT_METHODS)).min(1, "Choose at least one payment method."),
      check_payable_to: z.string().trim().max(160).default(""),
      check_mail_address: z.string().trim().max(400).default(""),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertCanEdit(context.supabase, context.userId, data.offering_id);
    const methods = normalizePaymentMethods(data.methods);
    if (methods.includes("check") && (!data.check_payable_to || !data.check_mail_address)) {
      throw new Error("Add who checks are payable to and where to mail them.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: prev } = await db.from("offerings").select("payment_methods, check_payable_to, check_mail_address").eq("id", data.offering_id).maybeSingle();
    const next = { payment_methods: methods, check_payable_to: data.check_payable_to || null, check_mail_address: data.check_mail_address || null };
    const { error } = await db.from("offerings").update(next).eq("id", data.offering_id);
    if (error) throw new Error(error.message);
    await db.from("offering_audit_events").insert({
      offering_id: data.offering_id,
      event_type: "payment_methods_updated",
      changes: [{ field: "payment_methods", from: prev ?? null, to: next }],
      summary: `Accepted payment methods set to ${methods.join(", ")}`,
      actor_id: context.userId,
      actor_email: ((context.claims as any)?.email as string | undefined) ?? null,
    });
    return { ok: true, methods };
  });
