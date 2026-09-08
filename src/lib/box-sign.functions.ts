import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const startSchema = z.object({ offering_document_id: z.string().uuid() });

/** Is real e-signing available (Box credentials present)? */
export const getSigningProvider = createServerFn({ method: "GET" }).handler(async () => {
  const configured = Boolean(
    process.env["BOX_CLIENT_ID"] &&
      process.env["BOX_CLIENT_SECRET"] &&
      process.env["BOX_ENTERPRISE_ID"],
  );
  return { provider: configured ? "box_sign" : "internal" };
});

/**
 * Uploads the fund document to Box, sends it out through Box Sign for this
 * investor and returns the signing URL. The signed copy comes back via the
 * Box webhook (or the refresh below).
 */
export const startBoxSigning = createServerFn({ method: "POST" })
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

    const { data: existing } = await supabaseAdmin
      .from("document_signatures")
      .select("id, provider, provider_agreement_id, provider_status")
      .eq("application_id", application.id)
      .eq("offering_document_id", doc.id)
      .maybeSingle();

    const { createSignRequest, getSignRequest, uploadFile } = await import("@/lib/box.server");

    // Reuse a live request instead of sending a duplicate.
    if (
      existing?.provider === "box_sign" &&
      existing.provider_agreement_id &&
      existing.provider_status === "out_for_signature"
    ) {
      const live = await getSignRequest(existing.provider_agreement_id).catch(() => null);
      if (live?.signingUrl) {
        await supabaseAdmin
          .from("document_signatures")
          .update({ provider_signing_url: live.signingUrl })
          .eq("id", existing.id);
        return { url: live.signingUrl, agreementId: existing.provider_agreement_id, reused: true };
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

    const safeTitle = doc.title.replace(/[^\w\- ]+/g, "").trim() || "Fund document";
    const fileName = `${safeTitle} — ${profile.legal_name ?? profile.email} — ${application.id.slice(0, 8)}.pdf`;
    const fileId = await uploadFile(fileName, pdfBytes);

    const request = await createSignRequest({
      fileId,
      signerEmail: profile.email,
      signerName: profile.legal_name ?? profile.email,
      documentName: `${offering?.name ?? "Harmonious"} — ${doc.title}`,
      message: `Please review and sign ${doc.title} for ${offering?.name ?? "the fund"}.`,
      externalId: `${application.id}:${doc.id}`,
      redirectUrl: "https://onboard.harmonious.co/portal",
    });

    const now = new Date().toISOString();
    const row = {
      application_id: application.id,
      offering_document_id: doc.id,
      signer_name: profile.legal_name ?? profile.email,
      signer_email: profile.email,
      signature_type: "box_sign",
      signature_value: request.id,
      consent_electronic: true,
      document_hash: "",
      provider: "box_sign",
      provider_agreement_id: request.id,
      provider_status: "out_for_signature",
      provider_signing_url: request.signingUrl,
      provider_source_file_id: fileId,
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
      event_type: "box_sign_sent",
      metadata: { sign_request_id: request.id, box_file_id: fileId, document_title: doc.title },
    });

    return { url: request.signingUrl, agreementId: request.id, reused: false };
  });

/** Pulls the latest state from Box for the caller's in-flight sign requests. */
export const refreshBoxSignatures = createServerFn({ method: "POST" })
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
      .eq("provider", "box_sign")
      .eq("provider_status", "out_for_signature");

    if (!pending?.length) return { updated: 0 };

    const { syncBoxSignRequest } = await import("@/lib/box-sign-complete.server");
    let updated = 0;
    for (const row of pending) {
      if (!row.provider_agreement_id) continue;
      try {
        const res = await syncBoxSignRequest(row.provider_agreement_id);
        if (res.completed) updated += 1;
      } catch (e) {
        console.error("[box-sign] refresh failed", e);
      }
    }
    return { updated };
  });
