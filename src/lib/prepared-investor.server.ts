import type { PreparedField } from "@/lib/investor-prep-model";
import { type FieldProvenance, confirmedFacts, docApplies, effectiveResolverFacts, initialProvenance, mergeDocument, requiredMergeFields, reviewField, signatureConfig } from "@/lib/prepared-investor-workflow";

type ProvOnboarding = { id: string; offering_id: string; invitation_id: string | null };

/** Field provenance for many investments in two reads. A failed read is logged and treated as no rows (the pre-batch behavior). Single-row callers use the same path. */
export async function loadProvenanceMany(db: any, obs: ProvOnboarding[]) {
  const out = new Map<string, { draft: any; prov: Record<string, FieldProvenance> }>();
  const invIds = [...new Set(obs.map((o) => o.invitation_id).filter((x): x is string => !!x))];
  const drafts: any[] = [];
  for (let i = 0; i < invIds.length; i += 100) {
    const { data, error } = await db.from("investor_prep_drafts").select("*").in("invitation_id", invIds.slice(i, i + 100)).eq("status", "sent");
    if (error) console.error(`Prepared draft read failed (treated as no rows): ${error.message}`);
    else drafts.push(...((data ?? []) as any[]));
  }
  const draftFor = (o: ProvOnboarding) => {
    const m = drafts.filter((d) => d.invitation_id === o.invitation_id && d.offering_id === o.offering_id);
    return m.length === 1 ? m[0] : null; // maybeSingle semantics: ambiguous → none
  };
  const withDraft = obs.filter((o) => o.invitation_id && draftFor(o));
  const reviews: any[] = [];
  const obIds = withDraft.map((o) => o.id);
  for (let i = 0; i < obIds.length; i += 100) {
    const { data, error } = await db.from("investor_prep_field_reviews").select("*").in("onboarding_id", obIds.slice(i, i + 100)).order("created_at");
    if (error) console.error(`Prepared review read failed (treated as no rows): ${error.message}`);
    else reviews.push(...((data ?? []) as any[]));
  }
  for (const o of obs) {
    const draft = o.invitation_id ? draftFor(o) : null;
    if (!draft) { out.set(o.id, { draft: null as any, prov: {} }); continue; }
    const prov = initialProvenance(((draft as any).fields ?? {}) as Record<string, PreparedField>, (draft as any).sent_at ?? (draft as any).updated_at);
    for (const r of reviews.filter((x) => x.onboarding_id === o.id)) {
      const p = prov[r.field_key]; if (!p) continue;
      prov[r.field_key] = reviewField(p, r.action === "confirm" ? { confirm: true } : { correct: r.new_value }, r.created_at);
    }
    out.set(o.id, { draft, prov });
  }
  return out;
}

/** Field provenance for one investment, rebuilt from the prepared draft + append-only review history. */
export async function loadProvenance(db: any, onboarding: ProvOnboarding) {
  return (await loadProvenanceMany(db, [onboarding])).get(onboarding.id)!;
}

export async function loadConfirmedFacts(db: any, onboarding: ProvOnboarding) {
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
  const { data: investment, error: investmentError } = await db.from("investor_onboardings").select("investment_profile_id, offering_class_key").eq("id", ob.id).single();
  if (investmentError || !investment) throw new Error("Investment document context isn't available.");
  const { data: storedProfile, error: profileError } = investment.investment_profile_id
    ? await db.from("investment_profiles").select("profile_type").eq("id", investment.investment_profile_id).maybeSingle()
    : { data: null, error: null };
  if (profileError) throw new Error("Investment profile isn't available.");
  const { data: docs, error: docsError } = await db.from("offering_documents")
    .select("id, offering_id, title, investor_required, requires_signature, signing_mode, template_key, file_path, applies_to, applicability")
    .eq("offering_id", ob.offering_id);
  if (docsError) throw new Error("Investment documents aren't available.");
  const { documentApplies } = await import("@/lib/offering-document-model");
  const confirmed = confirmedFacts(prov);
  const pt = String(effectiveResolverFacts({ profileType: storedProfile?.profile_type ?? null, requestedAmountCents: null, country: null }, confirmed).profileType ?? "unknown");
  const chosen = ((docs ?? []) as any[]).filter((d) =>
    docApplies(d.applies_to, pt) && documentApplies(d.applicability, { profileType: pt, classKey: investment?.offering_class_key ?? null }),
  );
  const profile: Record<string, unknown> = {};
  const { data: me } = await db.from("profiles").select("legal_name, email").eq("user_id", ob.investor_user_id).maybeSingle();
  if ((me as any)?.legal_name) profile["legal_name"] = (me as any).legal_name;
  if ((me as any)?.email) profile["email"] = (me as any).email;
  for (const [k, p] of Object.entries(prov)) profile[k] = p.currentValue;
  profile["profile_type"] = pt;
  const profileType = pt;
  const commitment = (profile["commitment_cents"] as number | undefined) ?? ob.requested_amount_cents ?? null;
  return { ...c, fund: fund as any, chosen, profile, profileType, commitment };
}

/** Fresh merge values for one document (used by the signing gate). */
export async function currentMerge(x: Awaited<ReturnType<typeof docContext>>, d: any) {
  const cfg = signatureConfig({ ...d, template_ready: true });
  return mergeDocument({ profile: { ...x.profile }, investment: { commitment_cents: x.commitment }, fund: { name: x.fund?.name ?? "", legal_entity_name: x.fund?.legal_entity_name ?? null }, effectiveDate: new Date().toISOString().slice(0, 10) }, requiredMergeFields(x.profileType, cfg.mode));
}

