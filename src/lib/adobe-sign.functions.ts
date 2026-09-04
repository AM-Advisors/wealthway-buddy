import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const startSchema = z.object({ offering_document_id: z.string().uuid() });

/** Is real e-signing available (Adobe credentials present)? */
export const getSigningProvider = createServerFn({ method: "GET" }).handler(async () => {
  return { provider: process.env["ADOBE_SIGN_INTEGRATION_KEY"] ? "adobe_sign" : "internal" };
});

/**
 * Sends the fund document to Adobe Acrobat Sign for this investor and returns
 * the signing URL. The signed copy comes back via the Adobe webhook.
 */
export const startAdobeSigning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => startSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: application } = await supabase
      .from("investor_applications")
      .select("id, offering_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!application) throw new Error("No application found.");

    const { data: doc } = await supabase
      .from("offering_documents")
      .select("id, title, body, doc_type, requires_signature, offering_id")
      .eq("id", data.offering_document_id)
      .maybeSingle();
    if (!doc || doc.offering_id !== application.offering_id) {
      throw new Error("Document not found for this offering.");
    }

    const { data: offering } = await supabase
      .from("offerings")
      .select("name, reg_type")
      .eq("id", application.offering_id)
      .maybeSingle();

    const { data: profile } = await supabase
      .from("profiles")
      .select("legal_name, email")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile?.email) throw new Error("Add your email to your profile before signing.");

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("commitment_cents")
      .eq("application_id", application.id)
      .maybeSingle();
    if (!subscription) throw new Error("Complete your subscription details before signing.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Reuse a live agreement instead of sending a duplicate.
    const { data: existing } = await supabaseAdmin
      .from("document_signatures")
      .select("id, provider, provider_agreement_id, provider_status")
      .eq("application_id", application.id)
      .eq("offering_document_id", doc.id)
      .maybeSingle();

    const {
      createAgreement,
      getSigningUrl,
      uploadTransientDocument,
    } = await import("@/lib/adobe-sign.server");

    if (
      existing?.provider === "adobe_sign" &&
      existing.provider_agreement_id &&
      existing.provider_status === "out_for_signature"
    ) {
      const url = await getSigningUrl(existing.provider_agreement_id);
      if (url) {
        await supabaseAdmin
          .from("document_signatures")
          .update({ provider_signing_url: url })
          .eq("id", existing.id);
        return { url, agreementId: existing.provider_agreement_id, reused: true };
      }
    }

    const { buildOfferingPdf } = await import("@/lib/offering-pdf.server");
    const pdfBytes = await buildOfferingPdf({
      offeringName: offering?.name ?? "Harmonious",
      regType: offering?.reg_type ?? "506b",
      title: doc.title,
      docType: doc.doc_type,
      body: doc.body,
      requiresSignature: Boolean(doc.requires_signature),
    });

    const fileName = `${doc.title.replace(/[^\w\- ]+/g, "").trim() || "Fund document"}.pdf`;
    const transientDocumentId = await uploadTransientDocument(fileName, pdfBytes);

    const agreementId = await createAgreement({
      name: `${offering?.name ?? "Harmonious"} — ${doc.title}`,
      transientDocumentId,
      signerEmail: profile.email,
      signerName: profile.legal_name ?? undefined,
      message: `Please review and sign ${doc.title} for ${offering?.name ?? "the fund"}.`,
      externalId: `${application.id}:${doc.id}`,
    });

    const now = new Date().toISOString();
    const row = {
      application_id: application.id,
      offering_document_id: doc.id,
      signer_name: profile.legal_name ?? profile.email,
      signer_email: profile.email,
      signature_type: "adobe_sign",
      signature_value: agreementId,
      consent_electronic: true,
      document_hash: "",
      provider: "adobe_sign",
      provider_agreement_id: agreementId,
      provider_status: "out_for_signature",
      provider_last_event_at: now,
      signed_at: now,
    };

    let signatureId = existing?.id ?? null;
    if (signatureId) {
      const { error } = await supabaseAdmin
        .from("document_signatures")
        .update({ ...row, pdf_path: null, provider_completed_at: null, manager_notified_at: null })
        .eq("id", signatureId);
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

    await supabaseAdmin
      .from("investor_applications")
      .update({ documents_status: "pending", updated_at: now })
      .eq("id", application.id);

    await supabaseAdmin.from("signature_audit_events").insert({
      application_id: application.id,
      signature_id: signatureId,
      event_type: "adobe_sign_sent",
      metadata: { agreement_id: agreementId, document_title: doc.title },
    });

    const url = await getSigningUrl(agreementId);
    return { url, agreementId, reused: false };
  });

/** Pulls the latest state from Adobe for the caller's in-flight agreements. */
export const refreshAdobeSignatures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: application } = await supabase
      .from("investor_applications")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!application) return { updated: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pending } = await supabaseAdmin
      .from("document_signatures")
      .select("provider_agreement_id")
      .eq("application_id", application.id)
      .eq("provider", "adobe_sign")
      .eq("provider_status", "out_for_signature");

    if (!pending?.length) return { updated: 0 };

    const { syncAdobeAgreement } = await import("@/lib/adobe-sign-complete.server");
    let updated = 0;
    for (const row of pending) {
      if (!row.provider_agreement_id) continue;
      try {
        const res = await syncAdobeAgreement(row.provider_agreement_id);
        if (res.completed) updated += 1;
      } catch (e) {
        console.error("[adobe-sign] refresh failed", e);
      }
    }
    return { updated };
  });
