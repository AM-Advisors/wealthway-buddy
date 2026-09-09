import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const UPLOAD_KINDS = [
  { value: "identification", label: "Government ID" },
  { value: "proof_of_address", label: "Proof of address" },
  { value: "entity_formation", label: "Entity formation documents" },
  { value: "trust_agreement", label: "Trust agreement" },
  { value: "bank_letter", label: "Bank letter or voided check" },
  { value: "tax_form", label: "Tax form (W-9 / W-8)" },
  { value: "other", label: "Other supporting document" },
] as const;

const kindValues = UPLOAD_KINDS.map((k) => k.value) as [string, ...string[]];

export type InvestorUploadRow = {
  id: string;
  file_name: string;
  doc_kind: string;
  note: string | null;
  uploaded_at: string;
};

async function currentApplication(supabase: any, userId: string) {
  const { data } = await supabase
    .from("investor_applications")
    .select("id, offering_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data as { id: string; offering_id: string } | null;
}

export const listMyUploads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("investor_documents")
      .select("id, file_name, doc_kind, note, uploaded_at")
      .eq("user_id", userId)
      .order("uploaded_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { uploads: (data ?? []) as InvestorUploadRow[] };
  });

export const recordMyUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        storage_path: z.string().min(1).max(500),
        file_name: z.string().min(1).max(255),
        doc_kind: z.enum(kindValues),
        note: z.string().max(500).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.storage_path.startsWith(`${userId}/`)) throw new Error("Invalid upload path.");

    const application = await currentApplication(supabase, userId);
    if (!application) throw new Error("No application found for your account.");

    const { error } = await supabase.from("investor_documents").insert({
      application_id: application.id,
      offering_id: application.offering_id,
      user_id: userId,
      storage_path: data.storage_path,
      file_name: data.file_name,
      doc_kind: data.doc_kind,
      note: data.note?.trim() ? data.note.trim() : null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("investor_documents")
      .select("storage_path")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!row) throw new Error("That file is not available.");

    const { data: signed, error } = await supabase.storage
      .from("investor-uploads")
      .createSignedUrl(row.storage_path, 300);
    if (error || !signed) throw new Error(error?.message ?? "Could not open that file.");
    return { url: signed.signedUrl };
  });

export const deleteMyUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("investor_documents")
      .select("id, storage_path")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!row) throw new Error("That file is not available.");

    await supabase.storage.from("investor-uploads").remove([row.storage_path]);
    const { error } = await supabase.from("investor_documents").delete().eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
