import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const OFFERING_FILES_BUCKET = "offering-files";

async function isAdminUser(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(data);
}

async function assertCanEdit(supabase: any, userId: string, offeringId: string) {
  if (await isAdminUser(supabase, userId)) return;
  const { data } = await supabase
    .from("fund_managers")
    .select("id")
    .eq("user_id", userId)
    .eq("offering_id", offeringId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden: you do not manage that fund.");
}

async function loadDocument(supabase: any, documentId: string) {
  const { data, error } = await supabase
    .from("offering_documents")
    .select("id, offering_id, title, file_name, file_path, file_size_bytes")
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That document no longer exists.");
  return data as any;
}

/** Record an uploaded file against a fund document (the browser uploads to storage first). */
export const attachOfferingDocumentFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        documentId: z.string().uuid(),
        filePath: z.string().min(3).max(400),
        fileName: z.string().trim().min(1).max(200),
        fileSizeBytes: z.number().int().min(0).max(60 * 1024 * 1024),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const doc = await loadDocument(context.supabase, data.documentId);
    await assertCanEdit(context.supabase, context.userId, doc.offering_id);

    if (!data.filePath.startsWith(`${doc.offering_id}/`)) {
      throw new Error("That file does not belong to this fund.");
    }

    const previousPath = doc.file_path as string | null;

    const { error } = await context.supabase
      .from("offering_documents")
      .update({
        file_path: data.filePath,
        file_name: data.fileName,
        file_size_bytes: data.fileSizeBytes,
      })
      .eq("id", data.documentId);
    if (error) throw new Error(error.message);

    if (previousPath && previousPath !== data.filePath) {
      await context.supabase.storage.from(OFFERING_FILES_BUCKET).remove([previousPath]);
    }

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("legal_name, email")
      .eq("user_id", context.userId)
      .maybeSingle();

    await context.supabase.from("offering_audit_events").insert({
      offering_id: doc.offering_id,
      offering_document_id: data.documentId,
      event_type: "document_updated",
      summary: `Uploaded file "${data.fileName}" to ${doc.title}`,
      changes: [{ field: "file_name", from: doc.file_name ?? "", to: data.fileName }],
      actor_id: context.userId,
      actor_name: (profile as any)?.legal_name ?? null,
      actor_email: (profile as any)?.email ?? (context.claims as any)?.email ?? null,
    });

    return { ok: true };
  });

/** Remove the uploaded file from a fund document. */
export const removeOfferingDocumentFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ documentId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const doc = await loadDocument(context.supabase, data.documentId);
    await assertCanEdit(context.supabase, context.userId, doc.offering_id);
    if (doc.file_path) {
      await context.supabase.storage.from(OFFERING_FILES_BUCKET).remove([doc.file_path]);
    }
    const { error } = await context.supabase
      .from("offering_documents")
      .update({ file_path: null, file_name: null, file_size_bytes: null })
      .eq("id", data.documentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Short-lived download link for an uploaded fund document file.
 * Storage policies limit reads to admins, the fund's managers and its investors.
 */
export const getOfferingDocumentFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ documentId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const doc = await loadDocument(context.supabase, data.documentId);
    if (!doc.file_path) throw new Error("This document has no uploaded file.");

    const { data: signed, error } = await context.supabase.storage
      .from(OFFERING_FILES_BUCKET)
      .createSignedUrl(doc.file_path, 300);
    if (error || !signed?.signedUrl) {
      throw new Error(error?.message ?? "Could not prepare that download.");
    }

    const { logLegalDocumentView } = await import("./legal-doc-views.server");
    await logLegalDocumentView(context.supabase, context.userId, doc, "viewed");

    return { url: signed.signedUrl, fileName: doc.file_name as string | null };
  });
