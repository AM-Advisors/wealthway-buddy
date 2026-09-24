import type { PreparedField } from "@/lib/investor-prep-model";
import { type FieldProvenance, confirmedFacts, docApplies, initialProvenance, mergeDocument, requiredMergeFields, reviewField, signatureConfig } from "@/lib/prepared-investor-workflow";

/** Field provenance for one investment, rebuilt from the prepared draft + append-only review history. */
export async function loadProvenance(db: any, onboarding: { id: string; offering_id: string; invitation_id: string | null }) {
  if (!onboarding.invitation_id) return { draft: null as any, prov: {} as Record<string, FieldProvenance> };
  const { data: draft } = await db.from("investor_prep_drafts").select("*")
    .eq("invitation_id", onboarding.invitation_id).eq("offering_id", onboarding.offering_id).eq("status", "sent").maybeSingle();
  if (!draft) return { draft: null as any, prov: {} as Record<string, FieldProvenance> };
  const prov = initialProvenance(((draft as any).fields ?? {}) as Record<string, PreparedField>, (draft as any).sent_at ?? (draft as any).updated_at);
  const { data: reviews } = await db.from("investor_prep_field_reviews").select("*").eq("onboarding_id", onboarding.id).order("created_at");
  for (const r of (reviews ?? []) as any[]) {
    const p = prov[r.field_key]; if (!p) continue;
    prov[r.field_key] = reviewField(p, r.action === "confirm" ? { confirm: true } : { correct: r.new_value }, r.created_at);
  }
  return { draft, prov };
}

export async function loadConfirmedFacts(db: any, onboarding: { id: string; offering_id: string; invitation_id: string | null }) {
  const { prov } = await loadProvenance(db, onboarding);
  return confirmedFacts(prov);
}

/** Loads the investor's own onboarding + the prepared draft. Anyone else is rejected. */
export async function ownContext(userId: string, onboardingId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: ob } = await db.from("investor_onboardings").select("id, offering_id, investor_user_id, invitation_id, requested_amount_cents, application_id")
    .eq("id", onboardingId).maybeSingle();
  if (!ob || (ob as any).investor_user_id !== userId) throw new Error("This investment isn't available.");
  const { draft, prov } = await loadProvenance(db, ob as any);
  return { db, ob: ob as any, draft, prov };
}

export async function docContext(userId: string, onboardingId: string) {
  const c = await ownContext(userId, onboardingId);
  const { db, ob, draft, prov } = c;
  const { data: fund } = await db.from("offerings").select("id, name, legal_entity_name").eq("id", ob.offering_id).maybeSingle();
  const selectedIds: string[] = ((draft?.documents ?? []) as any[]).map((s) => s.documentId);
  const { data: docs } = await db.from("offering_documents")
    .select("id, offering_id, title, investor_required, requires_signature, signing_mode, template_key, file_path, applies_to")
    .eq("offering_id", ob.offering_id);
  const pt = String(prov["profile_type"]?.currentValue ?? draft?.profile_type ?? "unknown");
  const chosen = ((docs ?? []) as any[]).filter((d) => docApplies(d.applies_to, pt) && (d.investor_required || (d.applies_to ?? []).length > 0 || selectedIds.includes(d.id)));
  const profile: Record<string, unknown> = {};
  const { data: me } = await db.from("profiles").select("legal_name, email").eq("user_id", ob.investor_user_id).maybeSingle();
  if ((me as any)?.legal_name) profile["legal_name"] = (me as any).legal_name;
  if ((me as any)?.email) profile["email"] = (me as any).email;
  for (const [k, p] of Object.entries(prov)) profile[k] = p.currentValue;
  const profileType = String(profile["profile_type"] ?? draft?.profile_type ?? "unknown");
  const commitment = (profile["commitment_cents"] as number | undefined) ?? ob.requested_amount_cents ?? null;
  return { ...c, fund: fund as any, chosen, profile, profileType, commitment };
}

/** Fresh merge values for one document (used by the signing gate). */
export async function currentMerge(x: Awaited<ReturnType<typeof docContext>>, d: any) {
  const cfg = signatureConfig({ ...d, template_ready: true });
  return mergeDocument({ profile: { ...x.profile }, investment: { commitment_cents: x.commitment }, fund: { name: x.fund?.name ?? "", legal_entity_name: x.fund?.legal_entity_name ?? null }, effectiveDate: new Date().toISOString().slice(0, 10) }, requiredMergeFields(x.profileType, cfg.mode));
}

