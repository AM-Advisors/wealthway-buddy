// Server-only: files each approved manager onboarding document into Box,
// under Manager onboarding › <Manager> › <Fund>, stamped with the approval
// time, and records the Box reference back on the row.

import { ensureSubfolder, isBoxConfigured, uploadFileTo } from "@/lib/box.server";

const ROOT_FOLDER_NAME = "Manager onboarding";

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

export interface ManagerDocArchiveResult {
  ok: boolean;
  skipped?: string;
  boxFileId?: string;
  filedAt?: string;
  error?: string;
}

/** Files one approved manager onboarding document into Box. Idempotent. */
export async function archiveManagerDocToBox(
  documentId: string,
): Promise<ManagerDocArchiveResult> {
  if (!isBoxConfigured()) return { ok: false, skipped: "box_not_configured" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row } = await supabaseAdmin
    .from("manager_onboarding_documents")
    .select(
      "id, user_id, offering_id, doc_type, file_name, storage_path, status, reviewed_at, box_file_id, box_uploaded_at",
    )
    .eq("id", documentId)
    .maybeSingle();

  if (!row) return { ok: false, skipped: "document_not_found" };
  if ((row as any).status !== "approved") return { ok: false, skipped: "not_approved" };
  if ((row as any).box_file_id && (row as any).box_uploaded_at) {
    return {
      ok: true,
      boxFileId: (row as any).box_file_id as string,
      filedAt: (row as any).box_uploaded_at as string,
    };
  }

  try {
    const download = await supabaseAdmin.storage
      .from("manager-uploads")
      .download((row as any).storage_path as string);
    if (download.error || !download.data) {
      throw new Error(download.error?.message ?? "That document is not in storage yet.");
    }
    const blob = download.data;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const contentType = (blob as any).type || "application/octet-stream";

    const [{ data: profile }, offeringResult] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("legal_name, email")
        .eq("user_id", (row as any).user_id as string)
        .maybeSingle(),
      (row as any).offering_id
        ? supabaseAdmin
            .from("offerings")
            .select("name")
            .eq("id", (row as any).offering_id as string)
            .maybeSingle()
        : Promise.resolve({ data: null as any }),
    ]);

    const manager = safeName(
      ((profile?.legal_name as string | null) ||
        (profile?.email as string | null) ||
        "Fund manager") as string,
    );
    const fundName = safeName(
      ((offeringResult as any)?.data?.name as string | null) ?? "Not fund specific",
    );

    const approvedAt = ((row as any).reviewed_at as string | null) ?? new Date().toISOString();
    const { base, ext } = splitExtension((row as any).file_name as string);
    const fileName = `${safeName(String((row as any).doc_type))} - ${safeName(base)} - approved ${stamp(
      approvedAt,
    )}${ext}`;

    const rootFolder = await ensureSubfolder(ROOT_FOLDER_NAME);
    const managerFolder = await ensureSubfolder(manager, rootFolder);
    const fundFolder = await ensureSubfolder(fundName, managerFolder);

    const uploaded = await uploadFileTo(fundFolder, fileName, bytes, contentType);
    const filedAt = new Date().toISOString();

    await supabaseAdmin
      .from("manager_onboarding_documents")
      .update({
        box_file_id: uploaded.id,
        box_folder_id: fundFolder,
        box_uploaded_at: filedAt,
        box_error: null,
      } as never)
      .eq("id", (row as any).id as string);

    return { ok: true, boxFileId: uploaded.id, filedAt };
  } catch (error: any) {
    const message = String(error?.message ?? error).slice(0, 400);
    console.error("[box-manager-doc] failed", documentId, message);
    await supabaseAdmin
      .from("manager_onboarding_documents")
      .update({ box_error: message } as never)
      .eq("id", documentId);
    return { ok: false, error: message };
  }
}
