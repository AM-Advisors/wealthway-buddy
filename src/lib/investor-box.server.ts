// Server-only: mirrors every investor-uploaded support document into Box,
// filed by fund and investor and stamped with the upload time, then records
// the Box reference on the row so reviewers can see it landed.

import { ensureSubfolder, isBoxConfigured, uploadFileTo } from "@/lib/box.server";

const ROOT_FOLDER_NAME = "Investor uploads";

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

function splitExtension(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) return { base: fileName, ext: "" };
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot) };
}

export interface UploadArchiveResult {
  ok: boolean;
  skipped?: string;
  boxFileId?: string;
  error?: string;
}

/**
 * Uploads one stored investor document into
 * Box › Investor uploads › <Fund name> › <Investor>, named with the upload
 * timestamp. Safe to call repeatedly: an existing name gets a new version.
 */
export async function archiveInvestorUploadToBox(
  documentId: string,
): Promise<UploadArchiveResult> {
  if (!isBoxConfigured()) return { ok: false, skipped: "box_not_configured" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row } = await supabaseAdmin
    .from("investor_documents")
    .select(
      "id, application_id, offering_id, user_id, storage_path, file_name, doc_kind, uploaded_at, box_file_id, box_uploaded_at",
    )
    .eq("id", documentId)
    .maybeSingle();

  if (!row) return { ok: false, skipped: "document_not_found" };
  if ((row as any).box_file_id && (row as any).box_uploaded_at) {
    return { ok: true, boxFileId: (row as any).box_file_id as string };
  }

  try {
    const download = await supabaseAdmin.storage
      .from("investor-uploads")
      .download(row.storage_path as string);
    if (download.error || !download.data) {
      throw new Error(download.error?.message ?? "That upload is not in storage yet.");
    }
    const blob = download.data;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const contentType = (blob as any).type || "application/octet-stream";

    const [{ data: offering }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from("offerings")
        .select("name")
        .eq("id", row.offering_id as string)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("legal_name, email")
        .eq("user_id", row.user_id as string)
        .maybeSingle(),
    ]);

    const fundName = safeName((offering?.name as string | null) ?? "Unassigned fund");
    const investor = safeName(
      ((profile?.legal_name as string | null) ||
        (profile?.email as string | null) ||
        "Investor") as string,
    );
    const uploadedAtSource = (row.uploaded_at as string | null) ?? new Date().toISOString();
    const { base, ext } = splitExtension(row.file_name as string);
    const fileName = `${safeName(String(row.doc_kind))} - ${safeName(base)} - ${stamp(
      uploadedAtSource,
    )}${ext}`;

    const rootFolder = await ensureSubfolder(ROOT_FOLDER_NAME);
    const fundFolder = await ensureSubfolder(fundName, rootFolder);
    const investorFolder = await ensureSubfolder(investor, fundFolder);

    const uploaded = await uploadFileTo(investorFolder, fileName, bytes, contentType);
    const filedAt = new Date().toISOString();

    await supabaseAdmin
      .from("investor_documents")
      .update({
        box_file_id: uploaded.id,
        box_folder_id: investorFolder,
        box_uploaded_at: filedAt,
        box_error: null,
      } as never)
      .eq("id", row.id as string);

    return { ok: true, boxFileId: uploaded.id };
  } catch (error: any) {
    const message = String(error?.message ?? error).slice(0, 400);
    console.error("[box-investor-upload] failed", documentId, message);
    await supabaseAdmin
      .from("investor_documents")
      .update({ box_error: message } as never)
      .eq("id", documentId);
    return { ok: false, error: message };
  }
}

/** Files every investor upload for one fund that is not in Box yet. */
export async function archiveOfferingUploads(offeringId: string): Promise<{
  archived: number;
  failed: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: rows } = await supabaseAdmin
    .from("investor_documents")
    .select("id, box_file_id")
    .eq("offering_id", offeringId)
    .limit(500);

  let archived = 0;
  let failed = 0;
  for (const row of (rows ?? []) as any[]) {
    if (row.box_file_id) continue;
    const result = await archiveInvestorUploadToBox(row.id as string);
    if (result.ok) archived += 1;
    else failed += 1;
  }
  return { archived, failed };
}
