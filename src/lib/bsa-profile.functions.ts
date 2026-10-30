import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { BSA_DOC_KINDS, defaultNextReview, safeBsaFileName, validateRisk, type BsaDocKind, type BsaRisk } from "@/lib/bsa-profile";

// Staff-only. Tables and the bucket have no client access; every call re-checks Harmonious staff.
const BUCKET = "bsa-documents";

async function staffAdmin(context: any) {
  const { data } = await context.supabase.rpc("is_any_staff");
  if (data !== true) throw new Error("Forbidden: Harmonious staff only.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function personFor(db: any, onboardingId: string): Promise<string> {
  const { data } = await db.from("investor_onboardings").select("person_id").eq("id", onboardingId).maybeSingle();
  if (!data?.person_id) throw new Error("Investor not found.");
  return data.person_id as string;
}

async function log(db: any, personId: string, event: string, actor: string, detail: Record<string, unknown> = {}) {
  await db.from("bsa_profile_events").insert({ person_id: personId, event, actor_id: actor, detail });
}

const ob = (i: { onboardingId: string }) => ({ onboardingId: String(i.onboardingId) });

export const getBsaProfileFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(ob)
  .handler(async ({ data, context }) => {
    const db = await staffAdmin(context);
    const personId = await personFor(db, data.onboardingId);
    const [p, o, d, e] = await Promise.all([
      db.from("bsa_profiles").select("*").eq("person_id", personId).maybeSingle(),
      db.from("bsa_beneficial_owners").select("id, full_name, ownership_percent, role, notes, created_at").eq("person_id", personId).is("removed_at", null).order("created_at"),
      db.from("bsa_documents").select("id, kind, title, file_name, created_at").eq("person_id", personId).is("archived_at", null).order("created_at", { ascending: false }),
      db.from("bsa_profile_events").select("id, event, detail, actor_id, created_at").eq("person_id", personId).order("created_at", { ascending: false }).limit(50),
    ]);
    return { profile: p.data ?? null, owners: o.data ?? [], documents: d.data ?? [], events: e.data ?? [] };
  });

export const saveBsaProfileFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: { onboardingId: string; riskRating?: string | null; riskReason?: string | null; sourceOfFunds?: string | null; sourceOfWealth?: string | null; nextReviewDate?: string | null; markReviewed?: boolean }) => i)
  .handler(async ({ data, context }) => {
    const db = await staffAdmin(context);
    const err = validateRisk(data.riskRating, data.riskReason);
    if (err) throw new Error(err);
    const personId = await personFor(db, data.onboardingId);
    const now = new Date();
    const row: Record<string, unknown> = {
      person_id: personId, risk_rating: data.riskRating || null, risk_reason: data.riskReason ?? null,
      source_of_funds: data.sourceOfFunds ?? null, source_of_wealth: data.sourceOfWealth ?? null,
      next_review_date: data.nextReviewDate || (data.markReviewed && data.riskRating ? defaultNextReview(data.riskRating as BsaRisk, now) : null),
      updated_by: context.userId, updated_at: now.toISOString(),
    };
    if (data.markReviewed) { row["last_reviewed_at"] = now.toISOString(); row["last_reviewed_by"] = context.userId; }
    const { error } = await db.from("bsa_profiles").upsert(row, { onConflict: "person_id" });
    if (error) throw new Error(error.message);
    await log(db, personId, data.markReviewed ? "reviewed" : "updated", context.userId, { risk: data.riskRating ?? null, next_review: row["next_review_date"] });
    return { ok: true };
  });

export const addBsaOwnerFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: { onboardingId: string; fullName: string; ownershipPercent?: number | null; role?: string | null; notes?: string | null }) => i)
  .handler(async ({ data, context }) => {
    const db = await staffAdmin(context);
    if (!data.fullName?.trim()) throw new Error("Enter the owner's name.");
    const pct = data.ownershipPercent;
    if (pct != null && (pct < 0 || pct > 100)) throw new Error("Ownership must be between 0 and 100%.");
    const personId = await personFor(db, data.onboardingId);
    const { error } = await db.from("bsa_beneficial_owners").insert({ person_id: personId, full_name: data.fullName.trim(), ownership_percent: pct ?? null, role: data.role ?? null, notes: data.notes ?? null, created_by: context.userId });
    if (error) throw new Error(error.message);
    await log(db, personId, "owner_added", context.userId, { name: data.fullName.trim() });
    return { ok: true };
  });

export const removeBsaOwnerFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: { onboardingId: string; ownerId: string }) => i)
  .handler(async ({ data, context }) => {
    const db = await staffAdmin(context);
    const personId = await personFor(db, data.onboardingId);
    await db.from("bsa_beneficial_owners").update({ removed_at: new Date().toISOString(), removed_by: context.userId }).eq("id", data.ownerId).eq("person_id", personId);
    await log(db, personId, "owner_removed", context.userId, { owner_id: data.ownerId });
    return { ok: true };
  });

export const startBsaUploadFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: { onboardingId: string; fileName: string }) => i)
  .handler(async ({ data, context }) => {
    const db = await staffAdmin(context);
    const personId = await personFor(db, data.onboardingId);
    const path = `${personId}/${crypto.randomUUID()}-${safeBsaFileName(data.fileName)}`;
    const { data: t, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: t?.token as string };
  });

export const recordBsaDocumentFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: { onboardingId: string; path: string; fileName: string; title: string; kind: BsaDocKind }) => i)
  .handler(async ({ data, context }) => {
    const db = await staffAdmin(context);
    if (!(data.kind in BSA_DOC_KINDS)) throw new Error("Choose a document type.");
    const personId = await personFor(db, data.onboardingId);
    if (!data.path.startsWith(`${personId}/`)) throw new Error("That upload doesn't belong to this investor.");
    const { error } = await db.from("bsa_documents").insert({ person_id: personId, kind: data.kind, title: data.title.trim() || data.fileName, file_name: data.fileName, storage_path: data.path, uploaded_by: context.userId });
    if (error) throw new Error(error.message);
    await log(db, personId, "document_added", context.userId, { kind: data.kind, title: data.title.trim() || data.fileName });
    return { ok: true };
  });

export const openBsaDocumentFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: { onboardingId: string; documentId: string }) => i)
  .handler(async ({ data, context }) => {
    const db = await staffAdmin(context);
    const personId = await personFor(db, data.onboardingId);
    const { data: doc } = await db.from("bsa_documents").select("storage_path").eq("id", data.documentId).eq("person_id", personId).maybeSingle();
    if (!doc) throw new Error("Document not found.");
    const { data: s, error } = await db.storage.from(BUCKET).createSignedUrl(doc.storage_path, 120);
    if (error) throw new Error(error.message);
    await log(db, personId, "document_opened", context.userId, { document_id: data.documentId });
    return { url: s.signedUrl as string };
  });

export const archiveBsaDocumentFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: { onboardingId: string; documentId: string }) => i)
  .handler(async ({ data, context }) => {
    const db = await staffAdmin(context);
    const personId = await personFor(db, data.onboardingId);
    await db.from("bsa_documents").update({ archived_at: new Date().toISOString(), archived_by: context.userId }).eq("id", data.documentId).eq("person_id", personId);
    await log(db, personId, "document_archived", context.userId, { document_id: data.documentId });
    return { ok: true };
  });
