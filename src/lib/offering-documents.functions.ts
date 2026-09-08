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

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin access required.");
}

/** Admin-only: renders the whole fund packet (cover, wire instructions, every document) as one PDF. */
export const downloadOfferingPacket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: offering, error } = await supabase
      .from("offerings")
      .select("id, name, reg_type, summary, min_investment_cents, target_raise_cents, is_open")
      .eq("id", data.offering_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!offering) throw new Error("Fund not found.");

    const [{ data: wireRow }, { data: docs }] = await Promise.all([
      supabase
        .from("offering_wire_instructions")
        .select("details")
        .eq("offering_id", offering.id)
        .maybeSingle(),
      supabase
        .from("offering_documents")
        .select("title, doc_type, body, requires_signature, sort_order")
        .eq("offering_id", offering.id)
        .order("sort_order", { ascending: true }),
    ]);

    const { buildOfferingPacketPdf } = await import("./offering-pdf.server");
    const bytes = await buildOfferingPacketPdf({
      offeringName: offering.name,
      regType: offering.reg_type,
      summary: offering.summary,
      minInvestmentCents: offering.min_investment_cents,
      targetRaiseCents: offering.target_raise_cents,
      isOpen: Boolean(offering.is_open),
      wireInstructions: ((wireRow as any)?.details ?? {}) as Record<string, string>,
      documents: (docs ?? []).map((d: any) => ({
        title: d.title,
        docType: d.doc_type,
        body: d.body,
        requiresSignature: Boolean(d.requires_signature),
      })),
    });

    return {
      filename: `${slugify(offering.name)}-packet.pdf`,
      base64: toBase64(bytes),
    };
  });
