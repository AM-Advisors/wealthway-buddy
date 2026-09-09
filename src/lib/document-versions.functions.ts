import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { OFFERING_FILES_BUCKET } from "@/lib/offering-files.functions";
import { TEMPLATE_PACKS } from "@/lib/document-templates.functions";
import { recordDocumentVersion } from "@/lib/document-versions.server";

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

/** The full change history of a fund's legal documents, newest first. */
export const listDocumentVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    await assertCanEdit(context.supabase, context.userId, data.offering_id);

    const { data: versions } = await context.supabase
      .from("offering_document_versions")
      .select(
        "id, offering_document_id, version, file_name, file_size_bytes, source, note, created_by, created_at",
      )
      .eq("offering_id", data.offering_id)
      .order("created_at", { ascending: false })
      .limit(200);

    const rows = (versions ?? []) as any[];

    const [{ data: documents }, { data: profiles }] = await Promise.all([
      context.supabase
        .from("offering_documents")
        .select("id, title, current_version, file_updated_at, template_pack")
        .eq("offering_id", data.offering_id),
      rows.length
        ? context.supabase
            .from("profiles")
            .select("user_id, legal_name, email")
            .in("user_id", Array.from(new Set(rows.map((r) => r.created_by).filter(Boolean))))
        : Promise.resolve({ data: [] } as any),
    ]);

    const docById = new Map(((documents ?? []) as any[]).map((d) => [d.id as string, d]));
    const personById = new Map(
      ((profiles ?? []) as any[]).map((p) => [
        p.user_id as string,
        (p.legal_name as string) || (p.email as string) || "Team member",
      ]),
    );

    return {
      documents: ((documents ?? []) as any[]).map((d) => ({
        id: d.id as string,
        title: d.title as string,
        current_version: (d.current_version as number) ?? 0,
        file_updated_at: (d.file_updated_at as string) ?? null,
        template_pack: (d.template_pack as string) ?? null,
      })),
      versions: rows.map((v) => ({
        id: v.id as string,
        document_id: v.offering_document_id as string,
        document_title: (docById.get(v.offering_document_id)?.title as string) ?? "Document",
        is_current:
          Number(docById.get(v.offering_document_id)?.current_version ?? 0) === Number(v.version),
        version: v.version as number,
        file_name: (v.file_name as string) ?? null,
        file_size_bytes: (v.file_size_bytes as number) ?? null,
        source: (v.source as string) ?? "upload",
        note: (v.note as string) ?? null,
        created_at: v.created_at as string,
        created_by_name: v.created_by ? (personById.get(v.created_by) ?? "Team member") : "System",
      })),
    };
  });

/** Short-lived download link for one historic version of a document. */
export const getDocumentVersionUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ version_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: version } = await context.supabase
      .from("offering_document_versions")
      .select("offering_id, file_path, file_name")
      .eq("id", data.version_id)
      .maybeSingle();
    if (!version) throw new Error("That version is no longer available.");
    await assertCanEdit(context.supabase, context.userId, (version as any).offering_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(OFFERING_FILES_BUCKET)
      .createSignedUrl((version as any).file_path, 300);
    if (error || !signed?.signedUrl) {
      throw new Error(error?.message ?? "Could not prepare that download.");
    }
    return { url: signed.signedUrl, fileName: (version as any).file_name as string | null };
  });

/** Put an earlier version back in front of investors, keeping it in the history. */
export const restoreDocumentVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ version_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: version } = await context.supabase
      .from("offering_document_versions")
      .select("offering_id, offering_document_id, version, file_path, file_name, file_size_bytes")
      .eq("id", data.version_id)
      .maybeSingle();
    if (!version) throw new Error("That version is no longer available.");

    const v = version as any;
    await assertCanEdit(context.supabase, context.userId, v.offering_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("offering_documents")
      .update({
        file_path: v.file_path,
        file_name: v.file_name,
        file_size_bytes: v.file_size_bytes,
      })
      .eq("id", v.offering_document_id);
    if (error) throw new Error(error.message);

    const newVersion = await recordDocumentVersion({
      offeringId: v.offering_id,
      documentId: v.offering_document_id,
      filePath: v.file_path,
      fileName: v.file_name,
      fileSizeBytes: v.file_size_bytes,
      source: "restore",
      note: `Restored version ${v.version}`,
      userId: context.userId,
    });

    return { version: newVersion };
  });

/**
 * Re-copy the published ILPA / SPV master files over the documents that came
 * from a template pack, so a fund picks up the latest wording as a new version.
 */
export const refreshTemplateDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ offering_id: z.string().uuid(), pack: z.enum(["ilpa", "spv"]) }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertCanEdit(context.supabase, context.userId, data.offering_id);

    const pack = TEMPLATE_PACKS.find((p) => p.id === data.pack);
    if (!pack) throw new Error("Unknown template pack.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: documents } = await supabaseAdmin
      .from("offering_documents")
      .select("id, title, template_key, template_pack")
      .eq("offering_id", data.offering_id);

    const rows = (documents ?? []) as any[];
    const updated: string[] = [];

    for (const item of pack.items) {
      const doc = rows.find(
        (d) =>
          (d.template_pack === pack.id && d.template_key === item.title) ||
          String(d.title).toLowerCase() === item.title.toLowerCase(),
      );
      if (!doc) continue;

      const { data: file, error: downloadError } = await supabaseAdmin.storage
        .from(OFFERING_FILES_BUCKET)
        .download(item.source_path);
      if (downloadError || !file) continue;

      const bytes = new Uint8Array(await file.arrayBuffer());
      const filePath = `${data.offering_id}/${crypto.randomUUID()}-${item.file_name}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from(OFFERING_FILES_BUCKET)
        .upload(filePath, bytes, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (uploadError) throw new Error(uploadError.message);

      await supabaseAdmin
        .from("offering_documents")
        .update({
          file_path: filePath,
          file_name: item.file_name,
          file_size_bytes: bytes.byteLength,
          template_pack: pack.id,
          template_key: item.title,
        })
        .eq("id", doc.id);

      await recordDocumentVersion({
        offeringId: data.offering_id,
        documentId: doc.id,
        filePath,
        fileName: item.file_name,
        fileSizeBytes: bytes.byteLength,
        source: "template",
        note: `Refreshed from ${pack.name}`,
        userId: context.userId,
      });

      updated.push(item.title);
    }

    return { updated };
  });
