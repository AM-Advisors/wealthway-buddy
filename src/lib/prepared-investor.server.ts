import type { PreparedField } from "@/lib/investor-prep-model";
import { type FieldProvenance, confirmedFacts, initialProvenance, reviewField } from "@/lib/prepared-investor-workflow";

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
