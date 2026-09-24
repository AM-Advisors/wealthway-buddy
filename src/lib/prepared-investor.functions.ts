import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PreparedField } from "@/lib/investor-prep-model";
import {
  type DocSnapshot, type FieldProvenance, affectedRequirements, allReviewed, assertConfirmable, fingerprint,
  initialProvenance, investorReviewView, isMaterial, isStale, mergeDocument, requiredMergeFields, reviewField,
  signatureConfig, signingHandoffBlocker,
} from "@/lib/prepared-investor-workflow";
import { PORTAL_STEP_REQUIREMENTS, type PortalStep } from "@/lib/onboard-portal-model";

/** Loads the investor's own onboarding + the prepared draft. Anyone else is rejected. */
async function ownContext(userId: string, onboardingId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: ob } = await db.from("investor_onboardings").select("id, offering_id, investor_user_id, invitation_id, requested_amount_cents")
    .eq("id", onboardingId).maybeSingle();
  if (!ob || (ob as any).investor_user_id !== userId) throw new Error("This investment isn't available.");
  const inv = (ob as any).invitation_id as string | null;
  const { data: draft } = inv
    ? await db.from("investor_prep_drafts").select("*").eq("invitation_id", inv).eq("offering_id", (ob as any).offering_id).eq("status", "sent").maybeSingle()
    : { data: null };
  let prov: Record<string, FieldProvenance> = {};
  if (draft) {
    prov = initialProvenance(((draft as any).fields ?? {}) as Record<string, PreparedField>, (draft as any).sent_at ?? (draft as any).updated_at);
    const { data: reviews } = await db.from("investor_prep_field_reviews").select("*").eq("onboarding_id", onboardingId).order("created_at");
    for (const r of (reviews ?? []) as any[]) {
      const p = prov[r.field_key]; if (!p) continue;
      prov[r.field_key] = reviewField(p, r.action === "confirm" ? { confirm: true } : { correct: r.new_value }, r.created_at);
    }
  }
  return { db, ob: ob as any, draft: draft as any, prov };
}

function stepFor(req: string | null): PortalStep | null {
  if (!req) return null;
  return (Object.keys(PORTAL_STEP_REQUIREMENTS) as PortalStep[]).find((s) => (PORTAL_STEP_REQUIREMENTS[s] as readonly string[]).includes(req)) ?? null;
}

export const getMyPreparedInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ onboardingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { draft, prov } = await ownContext(context.userId, data.onboardingId);
    if (!draft) return { hasPrepared: false as const, groups: [], complete: true };
    const profileType = String((prov["profile_type"]?.currentValue as string) ?? draft.profile_type ?? "unknown");
    return { hasPrepared: true as const, groups: JSON.parse(JSON.stringify(investorReviewView(prov, profileType))) as any[], complete: allReviewed(prov) };
  });

export const reviewPreparedField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    onboardingId: z.string().uuid(), key: z.string().max(60),
    action: z.enum(["confirm", "correct"]), value: z.union([z.string().max(500), z.number()]).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const ok = assertConfirmable(data.key);
    if (!ok.ok) throw new Error(ok.error);
    const { db, draft, prov } = await ownContext(context.userId, data.onboardingId);
    const p = prov[data.key];
    if (!draft || !p) throw new Error("There's nothing to review for that item.");
    if (data.action === "correct" && (data.value === undefined || data.value === "")) throw new Error("Please enter the correct value.");
    const next = reviewField(p, data.action === "confirm" ? { confirm: true } : { correct: data.value }, new Date().toISOString());
    const changed = next.history.length > p.history.length;
    const material = changed && isMaterial(data.key);
    const affected = material ? affectedRequirements([data.key]) : [];
    const { error } = await db.from("investor_prep_field_reviews").insert({
      draft_id: draft.id, onboarding_id: data.onboardingId, field_key: data.key, action: data.action,
      prepared_value: p.preparedValue as any, previous_value: p.currentValue as any, new_value: (changed ? data.value : p.currentValue) as any,
      prepared_by_capacity: p.preparedBy, material, affected_requirements: affected, actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    if (material) {
      // Mark generated documents stale; the authoritative engine re-evaluates requirements on next read.
      await db.from("investor_document_snapshots").update({ status: "stale" })
        .eq("onboarding_id", data.onboardingId).in("status", ["prepared", "reviewed"]);
    }
    return { material, requirementsUpdated: affected.length > 0, goTo: stepFor(affected.find((a) => a !== "investment_profile") ?? affected[0] ?? null) };
  });

async function docContext(userId: string, onboardingId: string) {
  const c = await ownContext(userId, onboardingId);
  const { db, ob, draft, prov } = c;
  const { data: fund } = await db.from("offerings").select("id, name, legal_entity_name").eq("id", ob.offering_id).maybeSingle();
  const selectedIds: string[] = ((draft?.documents ?? []) as any[]).map((s) => s.documentId);
  const { data: docs } = await db.from("offering_documents")
    .select("id, offering_id, title, investor_required, requires_signature, signing_mode, template_key, file_path")
    .eq("offering_id", ob.offering_id);
  const chosen = ((docs ?? []) as any[]).filter((d) => d.investor_required || selectedIds.includes(d.id));
  const profile: Record<string, unknown> = {};
  for (const [k, p] of Object.entries(prov)) profile[k] = p.currentValue;
  const profileType = String(profile["profile_type"] ?? draft?.profile_type ?? "unknown");
  const commitment = (profile["commitment_cents"] as number | undefined) ?? ob.requested_amount_cents ?? null;
  return { ...c, fund: fund as any, chosen, profile, profileType, commitment };
}

export const getMyDocumentsForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ onboardingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const x = await docContext(context.userId, data.onboardingId);
    const out: any[] = [];
    for (const d of x.chosen) {
      const cfg = signatureConfig({ ...d, template_ready: true });
      const merged = mergeDocument({ profile: { ...x.profile }, investment: { commitment_cents: x.commitment }, fund: { name: x.fund?.name ?? "", legal_entity_name: x.fund?.legal_entity_name ?? null }, effectiveDate: new Date().toISOString().slice(0, 10) }, requiredMergeFields(x.profileType, cfg.mode));
      const { data: snaps } = await x.db.from("investor_document_snapshots").select("*").eq("onboarding_id", data.onboardingId).eq("document_id", d.id).order("version", { ascending: false });
      const history = (snaps ?? []) as any[];
      let latest = history[0] ?? null;
      const snapOf = (r: any): DocSnapshot | null => r ? { version: r.version, documentId: r.document_id, templateRef: r.template_ref, profileFingerprint: r.profile_fingerprint, mergeValues: r.merge_values, signingMode: r.signing_mode, status: r.status, reviewedAt: r.reviewed_at } : null;
      const compare = { ...merged.values, effective_date: latest?.merge_values?.effective_date ?? merged.values["effective_date"] };
      if (!merged.missing.length && (!latest || latest.status === "stale" || isStale(snapOf(latest)!, compare))) {
        if (latest && latest.status !== "superseded" && latest.status !== "sent_for_signature") await x.db.from("investor_document_snapshots").update({ status: "superseded" }).eq("id", latest.id);
        const { data: ins } = await x.db.from("investor_document_snapshots").insert({
          onboarding_id: data.onboardingId, offering_id: x.ob.offering_id, document_id: d.id, version: (latest?.version ?? 0) + 1,
          template_ref: String(d.template_key ?? d.file_path ?? d.id), profile_fingerprint: fingerprint(x.profile),
          merge_values: merged.values, merge_sources: merged.sources, signing_mode: cfg.mode, created_by: context.userId,
        }).select("*").single();
        latest = ins;
      }
      const snap = snapOf(latest);
      out.push({
        documentId: d.id, title: d.title, signingMode: cfg.mode, snapshotId: latest?.id ?? null, version: latest?.version ?? null,
        values: merged.values, missing: merged.missing.map((m) => ({ message: m.message, field: m.profileKey })),
        blocker: signingHandoffBlocker(snap, snap ? snap.mergeValues : merged.values, merged.missing),
        previousVersions: Math.max(0, history.length - (latest && history[0]?.id === latest.id ? 1 : 0)),
      });
    }
    return { documents: out };
  });

/** Opening/reviewing is not signing; Box remains authoritative for signature completion. */
export const markDocumentReviewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ onboardingId: z.string().uuid(), snapshotId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { db } = await ownContext(context.userId, data.onboardingId);
    const { data: s } = await db.from("investor_document_snapshots").select("id, status, onboarding_id").eq("id", data.snapshotId).maybeSingle();
    if (!s || (s as any).onboarding_id !== data.onboardingId) throw new Error("That document isn't available.");
    if ((s as any).status !== "prepared") throw new Error((s as any).status === "reviewed" ? "Already reviewed." : "Document needs to be regenerated");
    await db.from("investor_document_snapshots").update({ status: "reviewed", reviewed_at: new Date().toISOString() }).eq("id", data.snapshotId);
    return { ok: true };
  });
