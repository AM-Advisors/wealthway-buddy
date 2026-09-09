// Server-only: mirrors every completed signature into Box, filed by fund and
// stamped with the signing time, then records the Box reference on the
// signature row so reviewers can see it landed without leaving the portal.

import { ensureSubfolder, isBoxConfigured, uploadFileTo } from "@/lib/box.server";

const ROOT_FOLDER_NAME = "Signed investor documents";

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 90);
}

function stamp(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}${pad(d.getUTCMinutes())}Z`;
}

export interface ArchiveResult {
  ok: boolean;
  skipped?: string;
  boxFileId?: string;
  error?: string;
}

/**
 * Uploads the stored signed PDF for one signature into
 * Box › Signed investor documents › <Fund name>, named with the signing
 * timestamp. Safe to call repeatedly: an existing file gets a new version.
 */
export async function archiveSignatureToBox(signatureId: string): Promise<ArchiveResult> {
  if (!isBoxConfigured()) return { ok: false, skipped: "box_not_configured" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: signature } = await supabaseAdmin
    .from("document_signatures")
    .select(
      "id, application_id, offering_document_id, signer_name, signed_at, pdf_path, document_hash, box_file_id, box_uploaded_at",
    )
    .eq("id", signatureId)
    .maybeSingle();

  if (!signature) return { ok: false, skipped: "signature_not_found" };
  if (!signature.pdf_path) return { ok: false, skipped: "no_signed_pdf" };
  if (signature.box_file_id && signature.box_uploaded_at) {
    return { ok: true, boxFileId: signature.box_file_id as string };
  }

  try {
    const download = await supabaseAdmin.storage
      .from("signed-documents")
      .download(signature.pdf_path as string);
    if (download.error || !download.data) {
      throw new Error(download.error?.message ?? "Signed copy is not in storage yet.");
    }
    const bytes = new Uint8Array(await download.data.arrayBuffer());

    const { data: application } = await supabaseAdmin
      .from("investor_applications")
      .select("id, user_id, offering_id")
      .eq("id", signature.application_id as string)
      .maybeSingle();

    const [{ data: offering }, { data: doc }, { data: profile }] = await Promise.all([
      application
        ? supabaseAdmin.from("offerings").select("name").eq("id", application.offering_id).maybeSingle()
        : Promise.resolve({ data: null as { name: string } | null }),
      supabaseAdmin
        .from("offering_documents")
        .select("title")
        .eq("id", signature.offering_document_id as string)
        .maybeSingle(),
      application
        ? supabaseAdmin.from("profiles").select("legal_name").eq("user_id", application.user_id).maybeSingle()
        : Promise.resolve({ data: null as { legal_name: string | null } | null }),
    ]);

    const fundName = safeName(offering?.name ?? "Unassigned fund");
    const investor = safeName(
      (profile?.legal_name as string | null) ?? (signature.signer_name as string) ?? "Investor",
    );
    const title = safeName((doc?.title as string | null) ?? "Fund document");
    const signedAt = (signature.signed_at as string | null) ?? new Date().toISOString();

    const root = await ensureSubfolder(ROOT_FOLDER_NAME);
    const fundFolder = await ensureSubfolder(fundName, root);
    const fileName = `${investor} - ${title} - ${stamp(signedAt)}.pdf`;

    const uploaded = await uploadFileTo(fundFolder, fileName, bytes, "application/pdf");
    const uploadedAt = new Date().toISOString();

    await supabaseAdmin
      .from("document_signatures")
      .update({
        box_file_id: uploaded.id,
        box_folder_id: fundFolder,
        box_uploaded_at: uploadedAt,
        box_error: null,
      } as never)
      .eq("id", signature.id as string);

    await supabaseAdmin.from("signature_audit_events").insert({
      application_id: signature.application_id as string,
      signature_id: signature.id as string,
      event_type: "signed_copy_archived_to_box",
      metadata: {
        box_file_id: uploaded.id,
        box_folder_id: fundFolder,
        file_name: fileName,
        signed_at: signedAt,
        archived_at: uploadedAt,
        document_hash: signature.document_hash,
      },
    });

    return { ok: true, boxFileId: uploaded.id };
  } catch (error: any) {
    const message = String(error?.message ?? error).slice(0, 400);
    console.error("[box-archive] failed", signatureId, message);
    await supabaseAdmin
      .from("document_signatures")
      .update({ box_error: message } as never)
      .eq("id", signatureId);
    return { ok: false, error: message };
  }
}

/** Archives every signed document for an offering that is not in Box yet. */
export async function archiveOfferingSignatures(offeringId: string): Promise<{
  archived: number;
  failed: number;
  pending: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: applications } = await supabaseAdmin
    .from("investor_applications")
    .select("id")
    .eq("offering_id", offeringId);

  const appIds = (applications ?? []).map((a) => a.id as string);
  if (appIds.length === 0) return { archived: 0, failed: 0, pending: 0 };

  const { data: signatures } = await supabaseAdmin
    .from("document_signatures")
    .select("id, pdf_path, box_file_id")
    .in("application_id", appIds);

  const todo = (signatures ?? []).filter((s) => s.pdf_path && !s.box_file_id);
  let archived = 0;
  let failed = 0;
  for (const signature of todo) {
    const result = await archiveSignatureToBox(signature.id as string);
    if (result.ok) archived += 1;
    else failed += 1;
  }
  const pending = (signatures ?? []).filter((s) => !s.pdf_path).length;
  return { archived, failed, pending };
}
