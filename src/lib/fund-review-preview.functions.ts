import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "./require-auth";
export const fundReviewPreviewFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().uuid(), documentId: z.string().uuid(), version: z.number().int() }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    await (await import("./fund-routine-access.server")).assertRoutineFund(db, context.userId, data.offeringId);
    const { data: v, error } = await db.from("offering_document_versions").select("id,file_path,file_name").eq("offering_id", data.offeringId).eq("offering_document_id", data.documentId).eq("version", data.version).maybeSingle();
    if (error || !v) throw new Error("This version is unavailable.");
    await (await import("./sealed-records.server")).assertUnsealedVersion(db, "offering_document_versions", v.id);
    const { data: link, error: linkError } = await db.storage.from("offering-files").createSignedUrl(v.file_path, 300);
    if (linkError || !link) throw new Error("Document could not be opened.");
    return { url: link.signedUrl as string, fileName: v.file_name as string | null };
  });