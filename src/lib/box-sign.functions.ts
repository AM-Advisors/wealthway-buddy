import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { activeApplicationId } from "@/lib/active-application";

const startSchema = z.object({ offering_document_id: z.string().uuid(), onboarding_id: z.string().uuid().optional() });

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

    // From onboard.harmonious.co the investment is explicit and must belong
    // to the caller; the signing return lands back on that same investment.
    let applicationId: string | null = null;
    let redirectUrl = "https://app.harmonious.co/portal";
    if (data.onboarding_id) {
      const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
      const { data: ob } = await admin
        .from("investor_onboardings")
        .select("id, application_id, investor_user_id")
        .eq("id", data.onboarding_id)
        .maybeSingle();
      if (!ob || (ob as any).investor_user_id !== userId || !(ob as any).application_id) {
        throw new Error("This investment is not ready for signing yet.");
      }
      applicationId = (ob as any).application_id as string;
      redirectUrl = `https://onboard.harmonious.co/onboard/i/${(ob as any).id}`;
    } else {
      applicationId = await activeApplicationId(supabase, userId);
    }
    const { data: application } = await supabase
      .from("investor_applications")
      .select("id, offering_id")
      .eq("user_id", userId)
      .eq("id", applicationId as string)
      .maybeSingle();
    if (!application) throw new Error("No application found.");

    const { data: doc } = await supabase
      .from("offering_documents")
      .select("id, title, body, doc_type, requires_signature, offering_id, signing_mode, countersigner_user_id, signature_template_version")
      .eq("id", data.offering_document_id)
      .maybeSingle();
    if (!doc || doc.offering_id !== application.offering_id) {
      throw new Error("Document not found for this offering.");
    }

    // Server-side send gate: a document must be fully prepared for signature.
    // The readiness badge is advisory; this check is the control.
    if (!doc.requires_signature) throw new Error("This document does not take a signature.");
    {
      const { supabaseAdmin: gateDb } = await import("@/integrations/supabase/client.server");
      const { data: blocks } = await gateDb
        .from("offering_document_signature_blocks")
        .select("signer_role, block_type")
        .eq("offering_document_id", doc.id);
      const { signingConfigComplete } = await import("@/lib/fund-onboarding-model");
      const mode = ((doc as any).signing_mode ?? "investor_only") as "investor_only" | "dual";
      const cfg = signingConfigComplete({
        mode,
        countersignerUserId: (doc as any).countersigner_user_id ?? null,
        blocks: (blocks ?? []) as any[],
      });
      if (!cfg.ready) {
        throw new Error(`This document isn't prepared for signature yet (missing: ${cfg.missing.join(", ")}).`);
      }
    }

    // Review gate: the exact current, reviewed document version — never a browser flag.
    let gateSnapshot: { id: string; version: number } | null = null;
    {
      const { supabaseAdmin: g } = await import("@/integrations/supabase/client.server");
      const { data: ob } = await g.from("investor_onboardings").select("id, investor_user_id, offering_id")
        .eq("application_id", application.id).not("stage", "in", "(closed,declined,cancelled)").maybeSingle();
      if (ob) {
        if ((ob as any).investor_user_id !== userId || (ob as any).offering_id !== doc.offering_id) throw new Error("This document isn't available.");
        const pis = await import("@/lib/prepared-investor.server");
        const { signingGate } = await import("@/lib/prepared-investor-workflow");
        const x = await pis.docContext(userId, (ob as any).id);
        const docRow = x.chosen.find((d: any) => d.id === doc.id);
        if (!docRow) throw new Error("Signing unavailable — this document doesn't apply to your investment.");
        const merged = await pis.currentMerge(x, docRow);
        const { data: snaps } = await g.from("investor_document_snapshots").select("*")
          .eq("onboarding_id", (ob as any).id).eq("document_id", doc.id).order("version", { ascending: false }).limit(1);
        const latest = ((snaps ?? []) as any[])[0] ?? null;
        const { onboardPortalDetail } = await import("@/lib/investor-onboarding.server");
        const portal: any = await onboardPortalDetail(userId, (ob as any).id).catch(() => null);
        const docsStep = (portal?.steps ?? []).find((st: any) => st.key === "documents");
        const verdict = signingGate({
          investorUserId: userId, onboardingId: (ob as any).id, offeringId: doc.offering_id, documentId: doc.id, latest,
          currentMergeValues: { ...merged.values, effective_date: latest?.merge_values?.effective_date ?? merged.values["effective_date"] ?? "" },
          missing: merged.missing, templateReady: true, signerConfigReady: true, prerequisitesMet: !!docsStep && docsStep.state !== "locked",
        });
        if (!verdict.ok) throw new Error(verdict.error);
        gateSnapshot = { id: verdict.snapshotId, version: verdict.version };
      }
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
      .select("id, provider, provider_agreement_id, provider_status, snapshot_id")
      .eq("application_id", application.id)
      .eq("offering_document_id", doc.id)
      .maybeSingle();

    const { createSignRequest, getSignRequest, uploadFile } = await import("@/lib/box.server");

    // Reuse a live request instead of sending a duplicate.
    if (
      existing?.provider === "box_sign" &&
      existing.provider_agreement_id &&
      existing.provider_status === "out_for_signature" &&
      (!gateSnapshot || (existing as any).snapshot_id === gateSnapshot.id)
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

    // Dual-signature documents: investor signs first (order 1), then the fund's
    // CURRENTLY assigned signatory (order 2). Box enforces the order and only
    // reports the request complete once every signer has signed.
    const dual = (doc as any).signing_mode === "dual";
    let countersigner: { user_id: string; email: string; name: string } | null = null;
    if (dual) {
      const csId = (doc as any).countersigner_user_id as string | null;
      const { data: rel } = csId
        ? await supabaseAdmin.from("fund_managers").select("id").eq("offering_id", doc.offering_id).eq("user_id", csId).maybeSingle()
        : { data: null };
      const { data: cs } = csId
        ? await supabaseAdmin.from("profiles").select("legal_name, email").eq("user_id", csId).maybeSingle()
        : { data: null };
      if (!rel || !(cs as any)?.email) {
        throw new Error("This document isn't ready to sign yet — the fund's countersigner hasn't been set up.");
      }
      countersigner = { user_id: csId as string, email: (cs as any).email, name: (cs as any).legal_name ?? (cs as any).email };
    }

    const request = dual && countersigner
      ? await (async () => {
          const { createMultiSignerRequest } = await import("@/lib/box.server");
          const detail = await createMultiSignerRequest({
            fileId,
            documentName: `${offering?.name ?? "Harmonious"} — ${doc.title}`,
            message: `Please review and sign ${doc.title} for ${offering?.name ?? "the fund"}.`,
            externalId: `${application.id}:${doc.id}`,
            redirectUrl,
            signers: [
              { email: profile.email as string, name: profile.legal_name ?? profile.email, order: 1, externalUserId: `${application.id}:${doc.id}:investor` },
              { email: countersigner.email, name: countersigner.name, order: 2, externalUserId: `${application.id}:${doc.id}:fund_manager` },
            ],
          });
          const inv = detail.signers.find((x) => x.email === String(profile.email).toLowerCase());
          return { id: detail.id, signingUrl: inv?.embedUrl ?? null };
        })()
      : await createSignRequest({
      fileId,
      signerEmail: profile.email,
      signerName: profile.legal_name ?? profile.email,
      documentName: `${offering?.name ?? "Harmonious"} — ${doc.title}`,
      message: `Please review and sign ${doc.title} for ${offering?.name ?? "the fund"}.`,
      externalId: `${application.id}:${doc.id}`,
      redirectUrl,
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
      provider_sent_at: now,
      provider_viewed_at: null,
      signed_at: now,
      signing_mode: dual ? "dual" : "investor_only",
      signature_template_version: Number((doc as any).signature_template_version ?? 1),
      snapshot_id: gateSnapshot?.id ?? null,
      snapshot_version: gateSnapshot?.version ?? null,
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
    if (gateSnapshot) {
      await supabaseAdmin.from("investor_document_snapshots").update({ status: "sent_for_signature", provider_request_id: request.id }).eq("id", gateSnapshot.id);
    }

    if (signatureId) {
      await supabaseAdmin.from("document_signature_signers").delete().eq("signature_id", signatureId).neq("status", "signed");
      const base = { signature_id: signatureId, application_id: application.id, offering_document_id: doc.id, offering_id: doc.offering_id, required: true, status: "sent", sent_at: now };
      const rows: any[] = [{ ...base, role_key: "investor", signing_order: 1, signer_user_id: userId, signer_email: profile.email, signer_name: profile.legal_name ?? profile.email }];
      if (countersigner) rows.push({ ...base, role_key: "fund_manager", signing_order: 2, status: "waiting", sent_at: null, signer_user_id: countersigner.user_id, signer_email: countersigner.email, signer_name: countersigner.name });
      await supabaseAdmin.from("document_signature_signers").insert(rows);
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
      .eq("id", await activeApplicationId(supabase, userId))
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

/**
 * Reviewer-side safety net: pulls Box for every in-flight signing request on a
 * fund, so a missed webhook never leaves a signed document out of the portal.
 */
export const syncFundSignatures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "fund_manager"]);
    if (!roles?.length) throw new Error("Forbidden: reviewer access required.");

    const isAdmin = roles.some((r: any) => r.role === "admin");
    if (!isAdmin) {
      const { data: assignment } = await supabase
        .from("fund_managers")
        .select("id")
        .eq("user_id", userId)
        .eq("offering_id", data.offering_id)
        .maybeSingle();
      if (!assignment) throw new Error("Forbidden: not assigned to this fund.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: applications } = await supabaseAdmin
      .from("investor_applications")
      .select("id")
      .eq("offering_id", data.offering_id);

    const appIds = (applications ?? []).map((a: any) => a.id as string);
    if (appIds.length === 0) return { checked: 0, completed: 0 };

    const { data: pending } = await supabaseAdmin
      .from("document_signatures")
      .select("provider_agreement_id")
      .in("application_id", appIds)
      .eq("provider", "box_sign")
      .eq("provider_status", "out_for_signature");

    const { syncBoxSignRequest } = await import("@/lib/box-sign-complete.server");
    let completed = 0;
    for (const row of pending ?? []) {
      if (!row.provider_agreement_id) continue;
      try {
        const res = await syncBoxSignRequest(row.provider_agreement_id);
        if (res.completed) completed += 1;
      } catch (e) {
        console.error("[box-sign] fund sync failed", e);
      }
    }

    // Safety net: file any signed copy that has not reached Box yet.
    const { archiveOfferingSignatures } = await import("@/lib/signed-box.server");
    const archive = await archiveOfferingSignatures(data.offering_id).catch(() => ({
      archived: 0,
      failed: 0,
      pending: 0,
    }));

    return { checked: (pending ?? []).length, completed, archived: archive.archived, archiveFailed: archive.failed };
  });

/** Files a single signed document into Box on demand, for reviewers. */
export const archiveSignedDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ signature_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "fund_manager"]);
    if (!roles?.length) throw new Error("Forbidden: reviewer access required.");

    const { data: signature } = await supabase
      .from("document_signatures")
      .select("id, application_id")
      .eq("id", data.signature_id)
      .maybeSingle();
    if (!signature) throw new Error("Signed document not found.");

    const { data: application } = await supabase
      .from("investor_applications")
      .select("offering_id")
      .eq("id", signature.application_id)
      .maybeSingle();
    if (!application) throw new Error("Application not found.");

    const isAdmin = roles.some((r: any) => r.role === "admin");
    if (!isAdmin) {
      const { data: assignment } = await supabase
        .from("fund_managers")
        .select("id")
        .eq("user_id", userId)
        .eq("offering_id", application.offering_id)
        .maybeSingle();
      if (!assignment) throw new Error("Forbidden: not assigned to this fund.");
    }

    const { archiveSignatureToBox } = await import("@/lib/signed-box.server");
    const result = await archiveSignatureToBox(data.signature_id);
    if (!result.ok) {
      throw new Error(
        result.skipped === "box_not_configured"
          ? "Box is not connected yet."
          : (result.error ?? "That signed copy could not be filed in Box yet."),
      );
    }
    return { ok: true };
  });
