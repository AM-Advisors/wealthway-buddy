import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const inputSchema = z.object({ document_id: z.string().uuid() });

/** Read the entitled source file, not a PDF rendered from an empty metadata body. */
export const readOfferingDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: document, error } = await supabase.from("offering_documents")
      .select("id, offering_id, title, body, file_path, active_version")
      .eq("id", data.document_id).maybeSingle();
    if (error || !document) throw new Error("Document not available. Please try again or contact your fund manager.");
    // The caller's RLS-protected read above authorizes the exact fund document.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const [versionResult, onboardingResult, signatureResult] = await Promise.all([
      db.from("offering_document_versions").select("id, version, file_path, file_name, target_onboarding_id, rollout_scope").eq("offering_document_id", document.id),
      db.from("investor_onboardings").select("id, application_id").eq("offering_id", document.offering_id).eq("investor_user_id", userId).is("removed_at", null).maybeSingle(),
      db.from("document_signatures").select("source_version_id, application_id, investor_applications!inner(user_id)").eq("offering_document_id", document.id).eq("investor_applications.user_id", userId).is("cancelled_at", null).is("superseded_by", null).maybeSingle(),
    ]);
    if (versionResult.error || onboardingResult.error || signatureResult.error) throw new Error("The document version could not be loaded. Please try again.");
    const { documentReadSource } = await import("@/lib/offering-document-reader");
    const source = documentReadSource(document, versionResult.data ?? [], onboardingResult.data?.id ?? null, signatureResult.data?.source_version_id ?? null);
    const { logLegalDocumentView } = await import("./legal-doc-views.server");
    if (source.kind === "text") {
      await logLegalDocumentView(supabase, userId, document as any, "viewed");
      return { kind: "text" as const, body: source.body, url: null, filename: null };
    }
    const signed = await supabaseAdmin.storage.from("offering-files").createSignedUrl(source.path, 300);
    if (signed.error || !signed.data?.signedUrl) throw new Error("The document file could not be opened. Please try again.");
    await logLegalDocumentView(supabase, userId, document as any, "viewed");
    return { kind: "file" as const, body: null, url: signed.data.signedUrl, filename: source.filename };
  });

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

    const { logLegalDocumentView } = await import("./legal-doc-views.server");
    await logLegalDocumentView(supabase, context.userId, doc as any, "downloaded");

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
        .rpc("get_wire_instructions", { p_offering_id: offering.id })
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
