import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { activeApplicationId } from "@/lib/active-application";

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
  offering_id: string | null;
  box_file_id: string | null;
  box_uploaded_at: string | null;
  box_error: string | null;
};

async function currentApplication(supabase: any, userId: string) {
  const { data } = await supabase
    .from("investor_applications")
    .select("id, offering_id")
    .eq("user_id", userId)
    .eq("id", await activeApplicationId(supabase, userId))
    .maybeSingle();
  return data as { id: string; offering_id: string } | null;
}

/** The funds this person can file paperwork against. */
async function myFunds(supabase: any, userId: string) {
  const { data: apps } = await supabase
    .from("investor_applications")
    .select("id, offering_id")
    .eq("user_id", userId);
  const ids = Array.from(
    new Set(((apps ?? []) as any[]).map((a) => a.offering_id as string).filter(Boolean)),
  );
  if (ids.length === 0) return [] as { id: string; name: string; applicationId: string }[];

  const { data: offerings } = await supabase.from("offerings").select("id, name").in("id", ids);
  const nameBy = new Map(((offerings ?? []) as any[]).map((o) => [String(o.id), o.name as string]));
  return ((apps ?? []) as any[])
    .filter((a) => a.offering_id)
    .map((a) => ({
      id: String(a.offering_id),
      name: nameBy.get(String(a.offering_id)) ?? "Fund",
      applicationId: String(a.id),
    }));
}

export const listMyUploads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ fundId: z.string().uuid().nullish() })
      .partial()
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let query = supabase
      .from("investor_documents")
      .select(
        "id, file_name, doc_kind, note, uploaded_at, offering_id, box_file_id, box_uploaded_at, box_error",
      )
      .eq("user_id", userId)
      .order("uploaded_at", { ascending: false });
    if (data?.fundId) query = query.eq("offering_id", data.fundId);

    const [{ data: rows, error }, funds] = await Promise.all([query, myFunds(supabase, userId)]);
    if (error) throw new Error(error.message);
    return { uploads: (rows ?? []) as InvestorUploadRow[], funds };
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
        offering_id: z.string().uuid().nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.storage_path.startsWith(`${userId}/`)) throw new Error("Invalid upload path.");

    // A file can be filed against any fund this person has an application for.
    let application: { id: string; offering_id: string } | null = null;
    if (data.offering_id) {
      const { data: row } = await supabase
        .from("investor_applications")
        .select("id, offering_id")
        .eq("user_id", userId)
        .eq("offering_id", data.offering_id)
        .maybeSingle();
      application = (row as any) ?? null;
      if (!application) throw new Error("That fund is not on your account.");
    } else {
      application = await currentApplication(supabase, userId);
    }
    if (!application) throw new Error("No application found for your account.");

    const { data: inserted, error } = await supabase
      .from("investor_documents")
      .insert({
        application_id: application.id,
        offering_id: application.offering_id,
        user_id: userId,
        storage_path: data.storage_path,
        file_name: data.file_name,
        doc_kind: data.doc_kind,
        note: data.note?.trim() ? data.note.trim() : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await (await import("@/lib/kyc-aml.server")).logComplianceEvent(supabase, {
      applicationId: application.id,
      offeringId: application.offering_id ?? null,
      userId,
      actorId: userId,
      actorRole: "investor",
      checkKind: "documents",
      action: "document_added",
      payload: { file_name: data.file_name, doc_kind: data.doc_kind },
      note: data.note ?? null,
    });


    // File the copy in the shared Box folder, exactly like signed documents.
    let filedToBox = false;
    try {
      const { archiveInvestorUploadToBox } = await import("@/lib/investor-box.server");
      const result = await archiveInvestorUploadToBox(inserted.id as string);
      filedToBox = Boolean(result.ok && result.boxFileId);
    } catch (boxError) {
      console.error("[investor-upload] box filing failed", boxError);
    }

    return { ok: true, id: inserted.id as string, filedToBox };
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

/** Reviewer or owner retry when the shared-folder copy did not go through. */
export const fileUploadToBox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // RLS decides whether this caller may see the row at all.
    const { data: row } = await supabase
      .from("investor_documents")
      .select("id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("That file is not available.");

    const { archiveInvestorUploadToBox } = await import("@/lib/investor-box.server");
    const result = await archiveInvestorUploadToBox(data.id);
    if (!result.ok) {
      throw new Error(
        result.skipped === "box_not_configured"
          ? "The shared document folder is not connected yet."
          : (result.error ?? "Could not file that document."),
      );
    }
    return { ok: true };
  });
