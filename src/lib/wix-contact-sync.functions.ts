/** Staff-only: fill blank investor contact details in a linked Harmonious fund from the Wix copy. Never overwrites, never emails. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

async function load(wixFundId: string) {
  const a = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
  const { latestAssociations, effectiveWixFundId } = await import("@/lib/wix-association-model");
  const { data: assocs } = await a.from("wix_staging_associations").select("kind, wix_id, offering_id, wix_fund_id, created_at").limit(10000);
  const link = latestAssociations(assocs ?? [], "fund").get(wixFundId);
  if (!link?.offering_id) throw new Error("Connect this Wix fund to its Harmonious fund and save first.");
  const invAssoc = latestAssociations(assocs ?? [], "investment");
  const { data: wixRows } = await a.from("wix_investment_staging").select("wix_id, wix_fund_id, full_name, entity_name, email, details").limit(5000);
  const wix = (wixRows ?? []).filter((w: any) => effectiveWixFundId(w.wix_fund_id, invAssoc.get(w.wix_id)) === wixFundId)
    .map((w: any) => ({ wixId: w.wix_id, fullName: w.full_name ? String(w.full_name).replace(/\s+/g, " ").trim() : null, entityName: w.entity_name && w.entity_name !== "N/A" ? w.entity_name : null, email: w.email, details: w.details ?? {} }));
  const { data: obs } = await a.from("investor_onboardings").select("id, person_id, persons(*), investment_profiles(legal_name)").eq("offering_id", link.offering_id).is("removed_at", null).limit(2000);
  const harm = (obs ?? []).filter((o: any) => o.persons).map((o: any) => ({ onboardingId: o.id, personId: o.person_id, firstName: o.persons.legal_first_name, lastName: o.persons.legal_last_name, profileName: o.investment_profiles?.legal_name ?? null, person: o.persons }));
  const { planSync } = await import("@/lib/wix-contact-sync-model");
  return { a, offeringId: link.offering_id as string, plan: planSync(harm, wix) };
}

const input = z.object({ wixFundId: z.string().min(1).max(100) });

export const previewWixContactSync = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input)
  .handler(async ({ data, context }) => {
    await (await import("@/lib/investor-onboarding.server")).assertStaff(context.userId);
    return (await load(data.wixFundId)).plan;
  });

export const applyWixContactSync = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input)
  .handler(async ({ data, context }) => {
    await (await import("@/lib/investor-onboarding.server")).assertStaff(context.userId);
    const { a, offeringId, plan } = await load(data.wixFundId);
    let investors = 0, fields = 0;
    for (const r of plan.rows) {
      if (!r.fills.length) continue;
      const patch = Object.fromEntries(r.fills.map((f) => [f.field, f.value]));
      // Blank-only guard at write time: re-read and drop anything filled since the preview.
      const { data: cur } = await a.from("persons").select("*").eq("id", r.personId).maybeSingle();
      for (const k of Object.keys(patch)) if (cur && cur[k] != null && String(cur[k]).trim() !== "") delete patch[k];
      if (!Object.keys(patch).length) continue;
      const { error } = await a.from("persons").update(patch).eq("id", r.personId);
      if (error) throw new Error(`Couldn't update ${r.investor}.`);
      await a.from("investor_record_changes").insert(Object.entries(patch).map(([field, v]) => ({ subject_table: "persons", subject_id: r.personId, field, old_value: null, new_value: v, source: "wix_import", actor_user_id: context.userId, offering_id: offeringId, onboarding_id: r.onboardingId, manager_visible: true })));
      investors += 1; fields += Object.keys(patch).length;
    }
    return { investors, fields };
  });
