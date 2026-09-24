import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const BLOCK_TYPES = [
  { value: "signature", label: "Signature" },
  { value: "initials", label: "Initials" },
  { value: "date", label: "Date signed" },
  { value: "full_name", label: "Full legal name" },
  { value: "title", label: "Title / capacity" },
  { value: "entity_name", label: "Entity name" },
  { value: "text", label: "Text" },
] as const;

export type SignatureBlockType = (typeof BLOCK_TYPES)[number]["value"];

const blockSchema = z.object({
  page_number: z.number().int().min(1).max(500),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.01).max(1),
  height: z.number().min(0.005).max(1),
  block_type: z.enum(["signature", "initials", "date", "full_name", "title", "entity_name", "text"]),
  signer_role: z.enum(["investor", "fund_manager"]).default("investor"),
  required: z.boolean().default(true),
});

async function loadDoc(supabase: any, documentId: string) {
  const { data, error } = await supabase
    .from("offering_documents")
    .select("id, offering_id, title, file_name, file_path")
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That document no longer exists.");
  return data as any;
}

async function canEditFund(supabase: any, userId: string, offeringId: string) {
  const { data: admin } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (admin) return true;
  const { data } = await supabase
    .from("fund_managers")
    .select("id")
    .eq("user_id", userId)
    .eq("offering_id", offeringId)
    .maybeSingle();
  return Boolean(data);
}

/** The signature blocks a client has placed on one fund document. */
export const listSignatureBlocks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ documentId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const doc = await loadDoc(context.supabase, data.documentId);
    const canEdit = await canEditFund(context.supabase, context.userId, doc.offering_id);

    const { data: rows, error } = await context.supabase
      .from("offering_document_signature_blocks")
      .select("id, page_number, x, y, width, height, block_type, required, sort_order, signer_role")
      .eq("offering_document_id", data.documentId)
      .order("page_number", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);

    return {
      canEdit,
      hasFile: Boolean(doc.file_path),
      fileName: (doc.file_name as string | null) ?? null,
      blocks: (rows ?? []).map((r: any) => ({
        id: r.id as string,
        page_number: Number(r.page_number),
        x: Number(r.x),
        y: Number(r.y),
        width: Number(r.width),
        height: Number(r.height),
        block_type: r.block_type as SignatureBlockType,
        required: Boolean(r.required),
        signer_role: (r.signer_role === "fund_manager" ? "fund_manager" : "investor") as "investor" | "fund_manager",
      })),
    };
  });

/** Replace every block on a document with the layout the client just placed. */
export const saveSignatureBlocks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ documentId: z.string().uuid(), blocks: z.array(blockSchema).max(200) })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const doc = await loadDoc(context.supabase, data.documentId);
    if (!(await canEditFund(context.supabase, context.userId, doc.offering_id))) {
      throw new Error("Forbidden: you do not manage that fund.");
    }

    const { count: before } = await context.supabase
      .from("offering_document_signature_blocks")
      .select("id", { count: "exact", head: true })
      .eq("offering_document_id", data.documentId);

    const { error: clearError } = await context.supabase
      .from("offering_document_signature_blocks")
      .delete()
      .eq("offering_document_id", data.documentId);
    if (clearError) throw new Error(clearError.message);

    if (data.blocks.length > 0) {
      const rows = data.blocks.map((b, index) => ({
        offering_document_id: data.documentId,
        page_number: b.page_number,
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        block_type: b.block_type,
        required: b.required,
        signer_role: b.signer_role,
        sort_order: index,
        created_by: context.userId,
      }));
      const { error } = await context.supabase
        .from("offering_document_signature_blocks")
        .insert(rows);
      if (error) throw new Error(error.message);
    }

    // Template changes never alter documents already sent: new sends pin the new version.
    const { data: current } = await context.supabase
      .from("offering_documents").select("signature_template_version").eq("id", data.documentId).maybeSingle();
    await context.supabase
      .from("offering_documents")
      .update({ signature_template_version: Number((current as any)?.signature_template_version ?? 1) + 1 })
      .eq("id", data.documentId);

    try {
      const { data: profile } = await context.supabase
        .from("profiles")
        .select("legal_name, email")
        .eq("user_id", context.userId)
        .maybeSingle();
      await context.supabase.from("offering_audit_events").insert({
        offering_id: doc.offering_id,
        offering_document_id: data.documentId,
        event_type: "document_updated",
        summary: `Signature blocks updated on ${doc.title}`,
        changes: [
          {
            field: "signature_blocks",
            from: String(before ?? 0),
            to: String(data.blocks.length),
          },
        ],
        actor_id: context.userId,
        actor_name: (profile as any)?.legal_name ?? null,
        actor_email: (profile as any)?.email ?? (context.claims as any)?.email ?? null,
      });
    } catch (err) {
      console.error("signature block audit failed", err);
    }

    return { ok: true, count: data.blocks.length };
  });
