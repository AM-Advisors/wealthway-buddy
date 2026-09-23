import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { activeApplicationId } from "@/lib/active-application";
import {
  canReviewGovernmentId,
  evaluateIdEvidence,
  extensionFor,
  isAllowedIdFile,
  providerSatisfiesId,
  requiredSides,
  statusAfterReplacement,
} from "@/lib/government-id";

const BUCKET = "government-ids";
const docType = z.enum(["passport", "drivers_license", "state_id"]);
const side = z.enum(["front", "back", "passport_page"]);

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

async function myApplication(supabase: any, userId: string) {
  const { data } = await supabase
    .from("investor_applications")
    .select("id, offering_id, kyc_status")
    .eq("user_id", userId)
    .eq("id", await activeApplicationId(supabase, userId))
    .maybeSingle();
  if (!data) throw new Error("No application found. Reload and try again.");
  return data as { id: string; offering_id: string | null; kyc_status: string | null };
}

async function logEvent(db: any, row: {
  document_id: string; user_id: string; actor_id: string;
  actor_role: "investor" | "reviewer"; action: string; detail?: Record<string, unknown>;
}) {
  const { error } = await db.from("government_id_events").insert({ ...row, detail: row.detail ?? {} });
  if (error) console.error("[government-id-trail]", error.message);
}

/** Current ID evidence for one application, including provider-captured evidence. */
export async function loadIdEvidence(db: any, userId: string, applicationId: string) {
  const [{ data: uploads }, { data: kyc }] = await Promise.all([
    db
      .from("government_id_documents")
      .select("id, side, document_type, status, user_id, application_id, file_name, confirmed_at")
      .eq("application_id", applicationId)
      .eq("user_id", userId)
      .eq("status", "active"),
    db
      .from("kyc_verifications")
      .select("id, provider, status, document_type, document_expired")
      .eq("application_id", applicationId)
      .maybeSingle(),
  ]);
  return {
    uploads: ((uploads ?? []) as any[]).map((u) => ({
      id: String(u.id), side: String(u.side), documentType: String(u.document_type),
      status: String(u.status), userId: String(u.user_id), applicationId: String(u.application_id),
      fileName: String(u.file_name), confirmedAt: (u.confirmed_at as string) ?? null,
    })),
    kyc: kyc as any,
    provider: kyc
      ? { provider: kyc.provider, documentType: kyc.document_type, status: kyc.status, documentExpired: kyc.document_expired }
      : null,
  };
}

export const getMyGovernmentId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const app = await myApplication(supabase, userId);
    const ev = await loadIdEvidence(await admin(), userId, app.id);
    return {
      uploads: ev.uploads.map(({ id, side, documentType, fileName, confirmedAt }) => ({ id, side, documentType, fileName, confirmedAt })),
      providedByVerification: providerSatisfiesId(ev.provider),
    };
  });

/** Server chooses the storage path; the browser only receives a one-time upload token. */
export const startGovernmentIdUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      side, documentType: docType,
      fileName: z.string().trim().min(1).max(200),
      mimeType: z.string().max(60),
      size: z.number().int(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const bad = isAllowedIdFile(data.mimeType, data.size, data.fileName);
    if (bad) throw new Error(bad);
    if (!requiredSides(data.documentType).includes(data.side)) {
      throw new Error("That page isn't needed for this document type.");
    }
    const app = await myApplication(supabase, userId);
    const db = await admin();
    const { data: person } = await db.from("persons").select("id").eq("user_id", userId).maybeSingle();
    const { data: kyc } = await db.from("kyc_verifications").select("id").eq("application_id", app.id).maybeSingle();

    const path = `${userId}/${app.id}/${crypto.randomUUID()}.${extensionFor(data.mimeType)}`;
    const { data: row, error } = await db
      .from("government_id_documents")
      .insert({
        user_id: userId, person_id: person?.id ?? null, application_id: app.id,
        kyc_verification_id: kyc?.id ?? null, side: data.side, document_type: data.documentType,
        storage_path: path, file_name: data.fileName, mime_type: data.mimeType, size_bytes: data.size,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { data: signed, error: signError } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (signError || !signed) throw new Error("Could not prepare the upload. Please try again.");
    return { id: String(row.id), path, token: String(signed.token) };
  });

export const confirmGovernmentIdUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const app = await myApplication(supabase, userId);
    const db = await admin();
    const { data: row } = await db
      .from("government_id_documents")
      .select("id, user_id, application_id, side, status, storage_path, document_type")
      .eq("id", data.id)
      .maybeSingle();
    if (!row || row.user_id !== userId || row.application_id !== app.id || row.status !== "pending") {
      throw new Error("That upload is not available.");
    }
    const folder = String(row.storage_path).split("/").slice(0, -1).join("/");
    const name = String(row.storage_path).split("/").pop();
    const { data: listed } = await db.storage.from(BUCKET).list(folder, { search: name });
    if (!((listed ?? []) as any[]).some((o) => o.name === name)) throw new Error("The file didn't finish uploading.");

    const now = new Date().toISOString();
    const { data: previous } = await db
      .from("government_id_documents")
      .select("id")
      .eq("application_id", app.id)
      .eq("side", row.side)
      .eq("status", "active");

    const { error } = await db.from("government_id_documents").update({ status: "active", confirmed_at: now }).eq("id", row.id);
    if (error) throw new Error(error.message);
    await logEvent(db, { document_id: row.id, user_id: userId, actor_id: userId, actor_role: "investor", action: "uploaded", detail: { side: row.side, document_type: row.document_type } });

    const replaced = ((previous ?? []) as any[]).map((p) => String(p.id));
    for (const oldId of replaced) {
      await db.from("government_id_documents").update({ status: "superseded", superseded_by: row.id, superseded_at: now }).eq("id", oldId);
      await logEvent(db, { document_id: oldId, user_id: userId, actor_id: userId, actor_role: "investor", action: "superseded", detail: { replaced_by: row.id } });
    }

    // Replacing identity evidence after a decision sends the check back to review.
    let reReview = false;
    if (replaced.length) {
      const { data: kyc } = await db.from("kyc_verifications").select("id, status").eq("application_id", app.id).maybeSingle();
      const next = statusAfterReplacement(kyc?.status ?? app.kyc_status);
      if (next) {
        reReview = true;
        if (kyc) await db.from("kyc_verifications").update({ status: next, updated_at: now }).eq("id", kyc.id);
        await db.from("investor_applications").update({ kyc_status: next, updated_at: now }).eq("id", app.id);
        await logEvent(db, { document_id: row.id, user_id: userId, actor_id: userId, actor_role: "investor", action: "review_required", detail: { reason: "id_replaced" } });
      }
    }
    return { ok: true, replaced: replaced.length, reReview };
  });

export const getMyGovernmentIdUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const db = await admin();
    const { data: row } = await db.from("government_id_documents").select("id, user_id, storage_path, status").eq("id", data.id).maybeSingle();
    if (!row || row.user_id !== userId || row.status === "pending") throw new Error("That file is not available.");
    const { data: signed, error } = await db.storage.from(BUCKET).createSignedUrl(row.storage_path, 120);
    if (error || !signed) throw new Error("Could not open that file.");
    await logEvent(db, { document_id: row.id, user_id: userId, actor_id: userId, actor_role: "investor", action: "viewed" });
    return { url: signed.signedUrl as string };
  });

async function requireIdReviewer(context: any) {
  const { requireOperations } = await import("@/lib/ops-access.functions");
  const { capabilities } = await requireOperations(context, "onboarding", "review");
  if (!canReviewGovernmentId(capabilities)) throw new Error("Forbidden: you don't have that permission.");
}

/** Metadata for Harmonious reviewers. No image, no full document number. */
export const getGovernmentIdReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ investorUserId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireIdReviewer(context);
    const db = await admin();
    const { data: apps } = await db.from("investor_applications").select("id, offering_id, kyc_status").eq("user_id", data.investorUserId).limit(50);
    const appIds = ((apps ?? []) as any[]).map((a) => a.id);
    if (!appIds.length) return { items: [] };
    const [{ data: kyc }, { data: docs }, { data: offerings }] = await Promise.all([
      db.from("kyc_verifications").select("application_id, provider, status, result, document_type, document_issuing_country, document_expiration_date, document_number_last4, document_expired, harmonious_decision").in("application_id", appIds),
      db.from("government_id_documents").select("id, application_id, side, document_type, status, file_name, confirmed_at, superseded_at").in("application_id", appIds).neq("status", "pending").order("created_at", { ascending: false }),
      db.from("offerings").select("id, name").in("id", ((apps ?? []) as any[]).map((a) => a.offering_id).filter(Boolean)),
    ]);
    const nameBy = new Map(((offerings ?? []) as any[]).map((o) => [o.id, o.name]));
    const items = ((apps ?? []) as any[]).map((a) => {
      const k = ((kyc ?? []) as any[]).find((r) => r.application_id === a.id);
      const r = (k?.result ?? {}) as Record<string, any>;
      const files = ((docs ?? []) as any[]).filter((d) => d.application_id === a.id);
      const type = k?.document_type ?? r["id_document_type"] ?? null;
      return {
        applicationId: a.id,
        fund: nameBy.get(a.offering_id) ?? "Fund",
        documentType: type,
        issuingCountry: k?.document_issuing_country ?? r["id_issuing_country"] ?? null,
        expiration: k?.document_expiration_date ?? r["id_expiration"] ?? null,
        last4: k?.document_number_last4 ?? r["id_document_number_last4"] ?? null,
        providedByVerification: providerSatisfiesId(k ? { provider: k.provider, documentType: k.document_type, status: k.status, documentExpired: k.document_expired } : null),
        provider: k?.provider ?? null,
        providerStatus: k?.status ?? null,
        reviewStatus: a.kyc_status,
        files: files.map((f) => ({ id: f.id, side: f.side, status: f.status, fileName: f.file_name, uploadedAt: f.confirmed_at, supersededAt: f.superseded_at })),
      };
    });
    return { items };
  });

export const getGovernmentIdReviewUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireIdReviewer(context);
    const db = await admin();
    const { data: row } = await db.from("government_id_documents").select("id, user_id, storage_path, status").eq("id", data.id).maybeSingle();
    if (!row || row.status === "pending") throw new Error("That file is not available.");
    const { data: signed, error } = await db.storage.from(BUCKET).createSignedUrl(row.storage_path, 120);
    if (error || !signed) throw new Error("Could not open that file.");
    await logEvent(db, { document_id: row.id, user_id: row.user_id, actor_id: context.userId, actor_role: "reviewer", action: "viewed" });
    return { url: signed.signedUrl as string };
  });

/** Server-side gate used by KYC submission. */
export async function assertIdEvidence(userId: string, applicationId: string, input: {
  documentType: string; documentNumber: string; issuingCountry: string; expiration: string;
}) {
  const ev = await loadIdEvidence(await admin(), userId, applicationId);
  const result = evaluateIdEvidence({ ...input, uploads: ev.uploads, provider: ev.provider, userId, applicationId });
  if (!result.ok) throw new Error(result.errors.join(" "));
  return result;
}
