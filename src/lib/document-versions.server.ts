/**
 * Version history for a fund's legal documents.
 * Every time a document's file changes — a template pack is applied, a manager
 * uploads a replacement, or an older version is restored — we append a row so
 * the earlier file stays downloadable.
 */

export type VersionSource = "template" | "upload" | "restore";

export async function recordDocumentVersion(input: {
  offeringId: string;
  documentId: string;
  filePath: string;
  fileName: string | null;
  fileSizeBytes: number | null;
  source: VersionSource;
  note?: string | null;
  userId: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // (offering_document_id, version) is unique in the database. Two concurrent
  // writers can compute the same next number; retry instead of failing so a
  // version is never lost or overwritten.
  let nextVersion = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: latest } = await supabaseAdmin
      .from("offering_document_versions")
      .select("version")
      .eq("offering_document_id", input.documentId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    nextVersion = Number((latest as any)?.version ?? 0) + 1;

    const { error } = await supabaseAdmin.from("offering_document_versions").insert({
      offering_document_id: input.documentId,
      offering_id: input.offeringId,
      version: nextVersion,
      file_name: input.fileName,
      file_path: input.filePath,
      file_size_bytes: input.fileSizeBytes,
      source: input.source,
      note: input.note ?? null,
      created_by: input.userId,
    });
    if (!error) break;
    if ((error as any).code !== "23505" || attempt === 4) throw new Error(error.message);
  }

  await supabaseAdmin
    .from("offering_documents")
    .update({ current_version: nextVersion, file_updated_at: new Date().toISOString() })
    .eq("id", input.documentId);

  return nextVersion;
}
