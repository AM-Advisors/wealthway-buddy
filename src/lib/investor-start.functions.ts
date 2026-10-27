import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth, requireSupabaseAuthUnverified } from "@/lib/require-auth";
import { missingProfileFields, planStartFund, profileFillPatch, PROFILE_FIELDS } from "@/lib/investor-start-model";

const STAFF_ROLES = ["admin", "super_admin", "operations", "client_success", "fund_administration", "finance", "executive", "cro", "sales", "marketing_manager", "marketing_specialist"];

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

async function isStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as any[]).some((r) => STAFF_ROLES.includes(String(r.role)));
}

/** The login person's basics that are still blank. Investment details live on the investment profile. */
export const getOwnProfileGap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuthUnverified])
  .handler(async ({ context }) => {
    const d = await admin();
    const { data: person } = await d.from("persons").select(`id, ${PROFILE_FIELDS.join(", ")}`).eq("user_id", context.userId).is("merged_into_person_id", null).limit(1).maybeSingle();
    const missing = missingProfileFields(person ?? null, { isStaff: await isStaff(context.supabase, context.userId) });
    return { missing, values: person ? Object.fromEntries(PROFILE_FIELDS.map((f) => [f, (person as any)[f] ?? ""])) : {} };
  });

export const saveOwnProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthUnverified])
  .validator((v: unknown) => z.object(Object.fromEntries(PROFILE_FIELDS.map((f) => [f, z.string().max(200).optional()]))).parse(v))
  .handler(async ({ context, data }) => {
    const d = await admin();
    const { data: person } = await d.from("persons").select(`id, ${PROFILE_FIELDS.join(", ")}`).eq("user_id", context.userId).is("merged_into_person_id", null).limit(1).maybeSingle();
    if (!person) throw new Error("We couldn't find your profile. Please refresh and try again.");
    const patch = profileFillPatch(person, data as any);
    if (Object.keys(patch).length) {
      const { error } = await d.from("persons").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", person.id);
      if (error) throw new Error("Your profile couldn't be saved. Please try again.");
      await d.from("investor_record_changes").insert(Object.entries(patch).map(([field, to]) => ({
        subject_table: "persons", subject_id: person.id, field, old_value: null, new_value: to, source: "investor", actor_user_id: context.userId,
      }))).then(() => null, () => null);
    }
    return { missing: missingProfileFields({ ...person, ...patch }, { isStaff: false }) };
  });

/** Creates (or reuses) the caller's own client organization so they can start a fund. MSA and the $2,500 fee follow. */
export const startOwnFund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ businessName: z.string().trim().min(2).max(160) }).parse(v))
  .handler(async ({ context, data }) => {
    const d = await admin();
    const { data: links } = await d.from("client_users").select("client_id, client_role").eq("user_id", context.userId).is("revoked_at", null);
    const plan = planStartFund(((links ?? []) as any[]).map((l) => ({ clientId: l.client_id, role: l.client_role })));
    if (plan.kind === "refuse") throw new Error(plan.reason);
    if (plan.kind === "reuse") return { clientId: plan.clientId, created: false };
    const email = String((context.claims as any)?.email ?? "") || null;
    const { data: c, error } = await d.from("clients").insert({
      name: data.businessName, legal_name: data.businessName, status: "active", created_by: context.userId, primary_contact_email: email,
    }).select("id").single();
    if (error) throw new Error("Your organization couldn't be created. Please try again.");
    const { error: e2 } = await d.from("client_users").insert({ client_id: c.id, user_id: context.userId, client_role: "client_gp", can_approve: true });
    if (e2) throw new Error("Your organization couldn't be created. Please try again.");
    await d.from("contract_audit_events").insert({ actor_id: context.userId, actor_role: "client", client_id: c.id, area: "start_own_fund", action: "investor created their own organization to start a fund (MSA and setup fee required)", target: data.businessName, source: "web" });
    return { clientId: c.id as string, created: true };
  });
