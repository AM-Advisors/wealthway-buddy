import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({ document_id: z.string().uuid() });

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Renders an offering document as a branded PDF for anyone entitled to read it.
 * RLS on offering_documents already scopes visibility to admins, fund managers
 * and investors attached to the offering, so a successful read is the check.
 */
export const downloadOfferingDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: doc, error } = await supabase
      .from("offering_documents")
      .select("id, offering_id, title, doc_type, body, requires_signature")
      .eq("id", data.document_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Document not available.");

    const { data: offering } = await supabase
      .from("offerings")
      .select("name, reg_type")
      .eq("id", doc.offering_id)
      .maybeSingle();

    const { buildOfferingPdf } = await import("./offering-pdf.server");
    const bytes = await buildOfferingPdf({
      offeringName: offering?.name ?? "Harmonious Fund",
      regType: offering?.reg_type ?? "506b",
      title: doc.title,
      docType: doc.doc_type,
      body: doc.body,
      requiresSignature: doc.requires_signature,
    });

    return {
      filename: `${slugify(offering?.name ?? "harmonious")}-${slugify(doc.title)}.pdf`,
      base64: toBase64(bytes),
    };
  });
