import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type FundDocument, type PreparerCapacity, defaultDocuments, reconcileDocuments, sendBlockers,
  toPreparedFields, validatePrepFields,
} from "@/lib/investor-prep-model";

async function capacityFor(context: any, offeringId: string): Promise<PreparerCapacity> {
  const { data: staff } = await context.supabase.rpc("is_any_staff");
  if (staff) return "harmonious";
  const { data: fm } = await context.supabase
    .from("fund_managers").select("offering_id").eq("offering_id", offeringId).eq("user_id", context.userId).maybeSingle();
  if (fm) return "fund_manager";
  throw new Error("Forbidden: you can only prepare investors for funds you manage.");
}

async function fundDocuments(context: any, offeringId: string): Promise<FundDocument[]> {
  const { data } = await context.supabase
    .from("offering_documents")
    .select("id, offering_id, title, investor_required, requires_signature, signing_mode, template_key, file_path, sort_order")
    .eq("offering_id", offeringId).order("sort_order");
  return ((data ?? []) as any[]).map((d) => ({
    id: d.id, offering_id: d.offering_id, title: d.title, investor_required: !!d.investor_required,
    requires_signature: !!d.requires_signature, signing_mode: String(d.signing_mode ?? ""),
    template_ready: !d.requires_signature || !!(d.template_key || d.file_path),
  }));
}

export const getPrepContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const capacity = await capacityFor(context, data.offeringId);
    const docs = await fundDocuments(context, data.offeringId);
    const { data: drafts } = await context.supabase
      .from("investor_prep_drafts")
      .select("id, email, display_name, profile_type, commitment_cents, status, preparer_capacity, documents, fields, related_people, updated_at")
      .eq("offering_id", data.offeringId).order("updated_at", { ascending: false });
    return { capacity, documents: docs, defaults: defaultDocuments(docs), drafts: (drafts ?? []) as any[] };
  });

const draftInput = z.object({
  offeringId: z.string().uuid(),
  draftId: z.string().uuid().optional().nullable(),
  email: z.string().trim().email(),
  displayName: z.string().trim().max(200).optional().nullable(),
  profileType: z.string().max(40).default("unknown"),
  commitmentCents: z.number().int().nonnegative().optional().nullable(),
  fields: z.record(z.string(), z.unknown()).default({}),
  relatedPeople: z.array(z.object({ role: z.string().max(60), name: z.string().max(200), email: z.string().max(200).optional().nullable() })).max(20).default([]),
  documents: z.array(z.object({ documentId: z.string().uuid(), requirement: z.enum(["required", "optional", "investor_specific"]) })).default([]),
  reason: z.string().max(500).optional().nullable(),
});

/** Save Draft — never sends, accepts, signs or funds anything. */
export const saveInvestorDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => draftInput.parse(d))
  .handler(async ({ data, context }) => {
    const capacity = await capacityFor(context, data.offeringId);
    const v = validatePrepFields(data.fields);
    if (!v.ok) throw new Error(v.error);
    const docs = await fundDocuments(context, data.offeringId);
    const r = reconcileDocuments(data.offeringId, docs, data.documents);
    if (!r.ok) throw new Error(r.error);
    const row = {
      offering_id: data.offeringId, email: data.email, display_name: data.displayName ?? null,
      profile_type: data.profileType, commitment_cents: data.commitmentCents ?? null,
      fields: toPreparedFields(data.fields, capacity) as any, related_people: data.relatedPeople.map((p) => ({ ...p, verification: "pending" })) as any,
      documents: r.selected as any, updated_at: new Date().toISOString(),
    };
    let id = data.draftId ?? null;
    let before: any = null;
    if (id) {
      const { data: prev } = await context.supabase.from("investor_prep_drafts").select("*").eq("id", id).eq("offering_id", data.offeringId).maybeSingle();
      if (!prev) throw new Error("That draft no longer exists.");
      if ((prev as any).status !== "draft") throw new Error("This investor has already been sent onboarding.");
      if ((prev as any).preparer_capacity !== capacity && !data.reason) throw new Error("Please give a reason for changing another preparer's draft.");
      before = prev;
      const { error } = await context.supabase.from("investor_prep_drafts").update(row).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await context.supabase.from("investor_prep_drafts")
        .insert({ ...row, created_by: context.userId, preparer_capacity: capacity }).select("id").single();
      if (error) throw new Error(error.message);
      id = (ins as any).id;
    }
    await context.supabase.from("investor_prep_events").insert({
      draft_id: id as string, actor_id: context.userId, actor_capacity: capacity, action: before ? "draft_updated" : "draft_created",
      before_value: before ? { email: before.email, fields: before.fields, documents: before.documents } : null,
      after_value: { email: row.email, fields: row.fields, documents: row.documents }, reason: data.reason ?? null,
    });
    return { id, capacity };
  });

/** Send Onboarding — reuses the existing invitation engine. */
export const sendPreparedInvestor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid(), draftId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const capacity = await capacityFor(context, data.offeringId);
    const { data: draft } = await context.supabase.from("investor_prep_drafts").select("*")
      .eq("id", data.draftId).eq("offering_id", data.offeringId).maybeSingle();
    if (!draft) throw new Error("That draft no longer exists.");
    if ((draft as any).status !== "draft") throw new Error("Onboarding was already sent.");
    const docs = await fundDocuments(context, data.offeringId);
    const blockers = sendBlockers({ email: (draft as any).email, docs, selected: (draft as any).documents ?? [] });
    if (blockers.length) throw new Error(blockers.join(" "));
    const { inviteInvestor } = await import("@/lib/investor-onboarding.server");
    const res: any = await inviteInvestor(context.userId, {
      offeringId: data.offeringId, email: (draft as any).email, name: (draft as any).display_name ?? null,
      intendedAmountCents: (draft as any).commitment_cents ?? null,
      source: `prepared:${capacity}:${(draft as any).profile_type}`,
    });
    await context.supabase.from("investor_prep_drafts").update({
      status: "sent", sent_at: new Date().toISOString(), invitation_id: res?.invitationId ?? res?.id ?? null,
    }).eq("id", data.draftId);
    await context.supabase.from("investor_prep_events").insert({
      draft_id: data.draftId, actor_id: context.userId, actor_capacity: capacity, action: "onboarding_sent",
    });
    return { ok: true, emailSent: !!res?.emailSent };
  });
