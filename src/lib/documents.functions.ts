import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applicationIdForOffering } from "@/lib/active-application";

/** Signing happens inside a fund, so every call may name the fund it is for. */
const fundScope = (data: unknown) =>
  z.object({ offering_id: z.string().uuid().optional() }).parse(data ?? {});

export const subscriptionSchema = z.object({
  commitment_cents: z.number().int().min(100000, "Enter your commitment amount"),
  ownership_title: z.string().trim().min(2, "Enter how title should be held").max(160),
  tax_classification: z.enum([
    "individual",
    "joint_tenants",
    "tenants_in_common",
    "llc",
    "s_corp",
    "c_corp",
    "partnership",
    "trust",
    "ira",
  ]),
});

export const signatureSchema = z.object({
  offering_document_id: z.string().uuid(),
  signer_name: z.string().trim().min(2, "Type your full legal name").max(120),
  signature_type: z.enum(["typed", "drawn"]),
  signature_value: z.string().trim().min(2).max(200000),
  initials: z.string().trim().min(1, "Enter your initials").max(8),
  consent_electronic: z.literal(true),
});

async function sha256Hex(text: string) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const getDocumentsStep = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(fundScope)
  .handler(async ({ data: scope, context }) => {
    const { supabase, userId } = context;

    const { data: application } = await supabase
      .from("investor_applications")
      .select(
        "id, offering_id, kyc_status, aml_status, accreditation_status, documents_status, funding_status, commitment_cents",
      )
      .eq("user_id", userId)
      .eq("id", await applicationIdForOffering(supabase, userId, scope.offering_id))
      .maybeSingle();

    if (!application) {
      return { application: null, offering: null, documents: [], signatures: [], subscription: null, profile: null };
    }

    const [{ data: offering }, { data: documents }, { data: signatures }, { data: subscription }, { data: profile }] =
      await Promise.all([
        supabase
          .from("offerings")
          .select("id, name, reg_type, min_investment_cents")
          .eq("id", application.offering_id)
          .maybeSingle(),
        supabase
          .from("offering_documents")
          .select("id, title, doc_type, body, requires_signature, sort_order")
          .eq("offering_id", application.offering_id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("document_signatures")
          .select("id, offering_document_id, signer_name, signed_at, document_hash, pdf_path")
          .eq("application_id", application.id),
        supabase
          .from("subscriptions")
          .select("*")
          .eq("application_id", application.id)
          .maybeSingle(),
        supabase.from("profiles").select("legal_name, email").eq("user_id", userId).maybeSingle(),
      ]);

    return {
      application,
      offering,
      documents: documents ?? [],
      signatures: signatures ?? [],
      subscription,
      profile,
    };
  });

export const saveSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    subscriptionSchema.extend({ offering_id: z.string().uuid().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: application } = await supabase
      .from("investor_applications")
      .select("id, offering_id")
      .eq("user_id", userId)
      .eq("id", await applicationIdForOffering(supabase, userId, data.offering_id))
      .maybeSingle();
    if (!application) throw new Error("No application found.");

    const { data: offering } = await supabase
      .from("offerings")
      .select("min_investment_cents")
      .eq("id", application.offering_id)
      .maybeSingle();

    if (offering && data.commitment_cents < offering.min_investment_cents) {
      throw new Error(
        `The minimum commitment for this offering is $${(offering.min_investment_cents / 100).toLocaleString("en-US")}.`,
      );
    }

    const now = new Date().toISOString();
    const existing = await supabase
      .from("subscriptions")
      .select("id")
      .eq("application_id", application.id)
      .maybeSingle();

    const payload = {
      application_id: application.id,
      commitment_cents: data.commitment_cents,
      ownership_title: data.ownership_title,
      tax_classification: data.tax_classification,
      status: "draft",
      updated_at: now,
    };

    if (existing.data) {
      const { error } = await supabase.from("subscriptions").update(payload).eq("id", existing.data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("subscriptions").insert(payload);
      if (error) throw new Error(error.message);
    }

    const { error: appError } = await supabase
      .from("investor_applications")
      .update({ commitment_cents: data.commitment_cents, updated_at: now })
      .eq("id", application.id);
    if (appError) throw new Error(appError.message);

    return { ok: true };
  });

export const signDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    signatureSchema.extend({ offering_id: z.string().uuid().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: application } = await supabase
      .from("investor_applications")
      .select("id, offering_id, accreditation_status")
      .eq("user_id", userId)
      .eq("id", await applicationIdForOffering(supabase, userId, data.offering_id))
      .maybeSingle();
    if (!application) throw new Error("No application found.");

    const { data: doc } = await supabase
      .from("offering_documents")
      .select("id, title, body, offering_id, file_path")
      .eq("id", data.offering_document_id)
      .maybeSingle();
    if (!doc || doc.offering_id !== application.offering_id) {
      throw new Error("Document not found for this offering.");
    }

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("commitment_cents, ownership_title, tax_classification")
      .eq("application_id", application.id)
      .maybeSingle();
    if (!subscription) throw new Error("Complete your subscription details before signing.");

    const signedAt = new Date().toISOString();
    const documentHash = await sha256Hex(`${doc.title}\n${doc.body}`);

    const request = getRequest();
    const ip =
      request?.headers.get("cf-connecting-ip") ??
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    const userAgent = request?.headers.get("user-agent") ?? null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildSignedPdf, stampSignedPdf } = await import("@/lib/signed-pdf.server");

    // When the client uploaded their own PDF and placed signature blocks on it,
    // the signer's details are stamped into those exact spots.
    let pdfBytes: Uint8Array | null = null;
    if ((doc as any).file_path) {
      const { data: placed } = await supabaseAdmin
        .from("offering_document_signature_blocks")
        .select("page_number, x, y, width, height, block_type")
        .eq("offering_document_id", doc.id)
        .order("page_number", { ascending: true })
        .order("sort_order", { ascending: true });

      if ((placed ?? []).length > 0) {
        try {
          const download = await supabaseAdmin.storage
            .from("offering-files")
            .download((doc as any).file_path as string);
          if (download.data) {
            pdfBytes = await stampSignedPdf({
              fileBytes: new Uint8Array(await download.data.arrayBuffer()),
              blocks: (placed ?? []).map((b: any) => ({
                page_number: Number(b.page_number),
                x: Number(b.x),
                y: Number(b.y),
                width: Number(b.width),
                height: Number(b.height),
                block_type: b.block_type,
              })),
              signerName: data.signer_name,
              initials: data.initials,
              ownershipTitle: subscription.ownership_title ?? "",
              signedAt,
              documentHash,
              commitmentCents: subscription.commitment_cents,
              ipAddress: ip,
            });
          }
        } catch (err) {
          console.error("stamping the uploaded PDF failed; falling back", err);
        }
      }
    }

    if (!pdfBytes) {
      pdfBytes = await buildSignedPdf({
        title: doc.title,
        body: doc.body,
        signerName: data.signer_name,
        initials: data.initials,
        signedAt,
        documentHash,
        commitmentCents: subscription.commitment_cents,
        ownershipTitle: subscription.ownership_title ?? "",
        ipAddress: ip,
      });
    }

    const pdfPath = `${userId}/${application.id}/${doc.id}.pdf`;
    const upload = await supabaseAdmin.storage
      .from("signed-documents")
      .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upload.error) throw new Error(upload.error.message);

    const existing = await supabaseAdmin
      .from("document_signatures")
      .select("id")
      .eq("application_id", application.id)
      .eq("offering_document_id", doc.id)
      .maybeSingle();

    const row = {
      application_id: application.id,
      offering_document_id: doc.id,
      signer_name: data.signer_name,
      signature_type: data.signature_type,
      signature_value: data.signature_value,
      initials: data.initials,
      consent_electronic: true,
      document_hash: documentHash,
      pdf_path: pdfPath,
      signed_at: signedAt,
    };

    let signatureId = existing.data?.id ?? null;
    if (signatureId) {
      const { error } = await supabaseAdmin.from("document_signatures").update(row).eq("id", signatureId);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("document_signatures")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      signatureId = inserted.id;
    }

    await supabaseAdmin.from("signature_audit_events").insert({
      application_id: application.id,
      signature_id: signatureId,
      event_type: "document_signed",
      ip_address: ip,
      user_agent: userAgent,
      metadata: { document_title: doc.title, document_hash: documentHash, signature_type: data.signature_type },
    });

    const { data: required } = await supabase
      .from("offering_documents")
      .select("id")
      .eq("offering_id", application.offering_id)
      .eq("requires_signature", true);

    const { data: signed } = await supabaseAdmin
      .from("document_signatures")
      .select("offering_document_id")
      .eq("application_id", application.id);

    const signedIds = new Set((signed ?? []).map((s) => s.offering_document_id));
    const allSigned = (required ?? []).every((r) => signedIds.has(r.id));

    if (allSigned) {
      await supabase
        .from("investor_applications")
        .update({ documents_status: "approved", current_step: "funding", updated_at: signedAt })
        .eq("id", application.id);
      await supabase
        .from("subscriptions")
        .update({ status: "signed", updated_at: signedAt })
        .eq("application_id", application.id);
    } else {
      await supabase
        .from("investor_applications")
        .update({ documents_status: "pending", updated_at: signedAt })
        .eq("id", application.id);
    }

    // File the signed copy in Box straight away, stamped with the signing time.
    if (signatureId) {
      try {
        const { archiveSignatureToBox } = await import("@/lib/signed-box.server");
        await archiveSignatureToBox(signatureId);
      } catch (e) {
        console.error("[box-archive] sign-time archive failed", e);
      }
    }

    void (await import("@/lib/manager-alerts.server")).drainManagerAlerts().catch(() => {});
    return { ok: true, allSigned, documentHash };
  });

export const getSignedDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ signature_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: signature } = await supabase
      .from("document_signatures")
      .select("pdf_path")
      .eq("id", data.signature_id)
      .maybeSingle();
    if (!signature?.pdf_path) throw new Error("Signed document not available.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("signed-documents")
      .createSignedUrl(signature.pdf_path, 300);
    if (error || !signed) throw new Error(error?.message ?? "Could not create download link.");

    return { url: signed.signedUrl };
  });
