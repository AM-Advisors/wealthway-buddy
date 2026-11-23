import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { activeApplicationId } from "@/lib/active-application";
import { CLIENT_ORIGIN_DEFAULT } from "@/lib/app-origins";
import { fundSignerReturnUrl, signerDoneUrl } from "@/lib/sign-window-url";

import { openRequestReusable } from "@/lib/signing-source-pin";

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
  .validator((data: unknown) => startSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // From the /onboard portal the investment is explicit and must belong
    // to the caller; the signing return lands back on that same investment.
    let applicationId: string | null = null;
    let redirectUrl = `${CLIENT_ORIGIN_DEFAULT}/portal`;
    if (data.onboarding_id) {
      const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
      const { data: ob } = await admin
        .from("investor_onboardings")
        .select("id, application_id, investor_user_id")
        .eq("id", data.onboarding_id)
        .maybeSingle();
      if (!ob || (ob as any).investor_user_id !== userId) {
        throw new Error("This investment is not ready for signing yet.");
      }
      // Link the investment's own record when it has none yet (same guarded step as verification).
      const { linkedApplicationForInvestment } = await import("@/lib/active-application");
      applicationId = await linkedApplicationForInvestment(supabase, ob as any, { link: true });
      redirectUrl = `${CLIENT_ORIGIN_DEFAULT}/onboard/i/${(ob as any).id}`;
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

    const { assertApplicationSigningVerification } = await import("@/lib/investor-onboarding.server");
    await assertApplicationSigningVerification(userId, application.id);

    const { data: doc } = await supabase
      .from("offering_documents")
      .select("id, title, body, doc_type, requires_signature, offering_id, signing_mode, countersigner_user_id, signature_template_version, document_category")
      .eq("id", data.offering_document_id)
      .maybeSingle();
    if (!doc || doc.offering_id !== application.offering_id) {
      throw new Error("Document not found for this offering.");
    }

    // Server-side send gate: the document must take a signature and, when the fund
    // countersigns, have its signatory chosen. Signature spots are optional; the
    // signing provider places the fields (same as the openSigningSession path).
    if (!doc.requires_signature) throw new Error("This document does not take a signature.");
    {
      const { signingConfigComplete } = await import("@/lib/fund-onboarding-model");
      const mode = ((doc as any).signing_mode ?? "investor_only") as "investor_only" | "dual";
      const cfg = signingConfigComplete({ mode, countersignerUserId: (doc as any).countersigner_user_id ?? null });
      if (!cfg.ready) {
        throw new Error("This document isn't ready to sign yet, the fund still needs to choose who countersigns it.");
      }
    }

    // Review gate: the exact current, reviewed document version - never a browser flag.
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
        if (!docRow) throw new Error("Signing unavailable, this document doesn't apply to your investment.");
        const merged = await pis.currentMerge(x, docRow);
        await pis.ensureOwnEntrySnapshot(x, docRow, merged, userId);
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

    // Newer invited investors may have no legacy profiles row; use the confirmed login email.
    const { accountContactFor } = await import("@/lib/account-contact.server");
    const { supabaseAdmin: contactDb } = await import("@/integrations/supabase/client.server");
    const contact = await accountContactFor(contactDb as any, userId);
    if (!contact.email) throw new Error("Add your email to your profile before signing.");
    const profile = { email: contact.email, legal_name: contact.legalName };

    // Named signer from "Completed by" (e.g. the GP of an investing fund or family office):
    // they receive the signature request by email; the investor never receives their signing link.
    let namedSigner: { email: string; name: string } | null = null;
    {
      const { supabaseAdmin: ns } = await import("@/integrations/supabase/client.server");
      const { data: obr } = await ns.from("investor_onboardings").select("id").eq("application_id", application.id)
        .not("stage", "in", "(closed,declined,cancelled)").maybeSingle();
      if (obr) {
        const { data: p } = await ns.from("onboarding_participants").select("full_name, email, removed_at")
          .eq("onboarding_id", (obr as any).id).eq("role", "signer").is("removed_at", null).limit(1).maybeSingle();
        const em = String((p as any)?.email ?? "").trim().toLowerCase();
        if (em && em !== String(profile.email).trim().toLowerCase()) namedSigner = { email: em, name: (p as any).full_name || em };
      }
    }
    const signerEmail = namedSigner?.email ?? (profile.email as string);
    const signerName = namedSigner?.name ?? (profile.legal_name ?? profile.email);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // The commitment recorded on the investment is reused; investors never re-enter it.
    const { ensureSigningCommitment } = await import("@/lib/signing-commitment.server");
    const subscription = await ensureSigningCommitment(supabaseAdmin, application.id);
    if (!subscription) throw new Error("Your investment amount hasn't been recorded yet. Go back to the investment amount step, then sign.");

    const { data: existing } = await supabaseAdmin
      .from("document_signatures")
      .select("id, provider, provider_agreement_id, provider_status, snapshot_id, signer_email, provider_sent_at")
      .eq("application_id", application.id)
      .eq("offering_document_id", doc.id)
      .maybeSingle();

    const { createSignRequest, getSignRequest, uploadFile, mapSignStatus } = await import("@/lib/box.server");

    // Reuse a live request instead of sending a duplicate.
    if (
      existing?.provider === "box_sign" &&
      existing.provider_agreement_id &&
      existing.provider_status === "out_for_signature" &&
      String((existing as any).signer_email ?? "").toLowerCase() === signerEmail.toLowerCase() &&
      (!gateSnapshot || (existing as any).snapshot_id === gateSnapshot.id) &&
      // Requests sent before guided signing, or blank subscription copies, are replaced.
      openRequestReusable({ sentAt: (existing as any).provider_sent_at, documentCategory: (doc as any).document_category })
    ) {
      const live = await getSignRequest(existing.provider_agreement_id).catch(() => null);
      if (namedSigner) {
        return { url: null, agreementId: existing.provider_agreement_id, reused: true, sentTo: namedSigner.name };
      }
      if (live?.signingUrl && mapSignStatus(String(live.status ?? "")) === "out_for_signature") {
        await supabaseAdmin
          .from("document_signatures")
          .update({ provider_signing_url: live.signingUrl })
          .eq("id", existing.id);
        return { url: live.signingUrl, agreementId: existing.provider_agreement_id, reused: true };
      }
    }

    // An unsigned older request is cancelled so only the guided copy stays open.
    if (existing?.provider === "box_sign" && existing.provider_agreement_id && existing.provider_status === "out_for_signature") {
      // Never replace a copy already signed at the signing service; record it instead.
      const { getSignRequestDetail } = await import("@/lib/box.server");
      const { liveSignatureRecorded } = await import("@/lib/document-signing");
      if (liveSignatureRecorded(await getSignRequestDetail(existing.provider_agreement_id).catch(() => null), signerEmail)) {
        const { syncBoxSignRequest } = await import("@/lib/box-sign-complete.server");
        await syncBoxSignRequest(existing.provider_agreement_id).catch(() => null);
        throw new Error("This document is already signed. Refresh the page to see it.");
      }
      const { cancelSignRequest } = await import("@/lib/box.server");
      await cancelSignRequest(existing.provider_agreement_id).catch(() => null);
    }

    const { investmentDocumentSource } = await import("@/lib/investment-document-source.server");
    const snapshot = gateSnapshot ? await (supabaseAdmin as any).from("investor_document_snapshots").select("merge_values").eq("id", gateSnapshot.id).single() : { data: null };
    const source = await investmentDocumentSource(supabaseAdmin, doc.id, application.id, snapshot.data?.merge_values, { newRequest: true });
    const { buildOfferingPdf } = await import("@/lib/offering-pdf.server");
    const rawPdfBytes = source.bytes ?? await buildOfferingPdf({
      offeringName: offering?.name ?? "Harmonious",
      regType: offering?.reg_type ?? "506b",
      title: doc.title,
      docType: doc.doc_type,
      body: source.kind === "text" ? source.body : doc.body,
      requiresSignature: Boolean(doc.requires_signature),
    });

    // Guided signing: each signer's own line gets a locked Box field (investor on the
    // Individuals or Entities page, fund signatory on the Acceptance page).
    let pdfBytes = rawPdfBytes;
    {
      const { data: obp } = await supabaseAdmin.from("investor_onboardings").select("investment_profile_id")
        .eq("application_id", application.id).not("stage", "in", "(closed,declined,cancelled)").maybeSingle();
      const profileId = (obp as any)?.investment_profile_id ?? null;
      const { data: ip } = profileId ? await supabaseAdmin.from("investment_profiles").select("profile_type").eq("id", profileId).maybeSingle() : { data: null };
      const pt = String((ip as any)?.profile_type ?? "individual");
      const { tagPdfSignatureLines } = await import("@/lib/pdf-sign-tags.server");
      const tagged = await tagPdfSignatureLines(rawPdfBytes, {
        investorIsEntity: !["individual", "joint"].includes(pt),
        fundCountersigns: (doc as any).signing_mode === "dual",
      });
      pdfBytes = tagged.bytes;
    }

    const safeTitle = doc.title.replace(/[^\w\- ]+/g, "").trim() || "Fund document";
    const { signingFileName } = await import("@/lib/box.server");
    const fileName = signingFileName(`${safeTitle} - ${profile.legal_name ?? profile.email} - ${application.id.slice(0, 8)}`, pdfBytes);
    const fileId = await uploadFile(fileName, pdfBytes);

    // Dual-signature documents: investor signs first (order 1), then the fund's
    // CURRENTLY assigned signatory (order 2). Box enforces the order and only
    // reports the request complete once every signer has signed.
    const dual = (doc as any).signing_mode === "dual";
    let countersigner: { user_id: string; email: string; name: string } | null = null;
    if (dual) {
      const csId = (doc as any).countersigner_user_id as string | null;
      // The countersigner may be a fund manager or an active Fund Signatory with a login.
      const { resolveFundCountersigner } = await import("@/lib/fund-countersigner.server");
      const cs = csId ? await resolveFundCountersigner(doc.offering_id, csId) : null;
      if (!cs) {
        throw new Error("This document isn't ready to sign yet, the fund's countersigner hasn't been set up.");
      }
      countersigner = { user_id: csId as string, email: cs.email, name: cs.name };
    }

    const request = dual && countersigner
      ? await (async () => {
          const { createMultiSignerRequest } = await import("@/lib/box.server");
          const detail = await createMultiSignerRequest({
            fileId,
            documentName: `${offering?.name ?? "Harmonious"} · ${doc.title}`,
            message: `Please review and sign ${doc.title} for ${offering?.name ?? "the fund"}.`,
            externalId: `${application.id}:${doc.id}`,
            redirectUrl,
            signers: [
              // Order 1: the named signer (emailed by Box) or the investor; order 2: the fund's countersigner.
              { email: signerEmail, name: signerName, order: 1, externalUserId: `${application.id}:${doc.id}:${namedSigner ? "named_signer" : "investor"}`, emailOnly: Boolean(namedSigner), ...(namedSigner ? { redirectUrl: signerDoneUrl() } : {}) },
              { email: countersigner.email, name: countersigner.name, order: 2, externalUserId: `${application.id}:${doc.id}:fund_manager`, redirectUrl: fundSignerReturnUrl(String(doc.offering_id)) },
            ],
          });
          const inv = namedSigner ? null : detail.signers.find((x) => x.email === String(profile.email).toLowerCase());
          return { id: detail.id, signingUrl: inv?.embedUrl ?? null };
        })()
      : await createSignRequest({
      fileId,
      signerEmail,
      signerName,
      ...(namedSigner ? { emailSigner: true } : {}),
      documentName: `${offering?.name ?? "Harmonious"} · ${doc.title}`,
      message: `Please review and sign ${doc.title} for ${offering?.name ?? "the fund"}.`,
      externalId: `${application.id}:${doc.id}`,
      // A named signer (trustee, officer) may not be the investor's login, so they get the public thank-you page.
      redirectUrl: namedSigner ? signerDoneUrl() : redirectUrl,
    });

    const now = new Date().toISOString();
    const row = {
      application_id: application.id,
      offering_document_id: doc.id,
      signer_name: signerName,
      signer_email: signerEmail,
      signature_type: "box_sign",
      signature_value: request.id,
      consent_electronic: true,
      document_hash: "",
      provider: "box_sign",
      provider_agreement_id: request.id,
      provider_status: "out_for_signature",
      provider_signing_url: namedSigner ? null : request.signingUrl,
      // Opening in the app replaces any copy the signing service emailed the investor.
      provider_delivery: null,
      provider_source_file_id: fileId,
      provider_last_event_at: now,
      provider_sent_at: now,
      provider_viewed_at: null,
      provider_error: null,
      box_error: null,
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
        .update({ ...row, pdf_path: null, provider_completed_at: null, manager_notified_at: null, cancelled_at: null, cancelled_by: null })
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
      const rows: any[] = [{ ...base, role_key: namedSigner ? "named_signer" : "investor", signing_order: 1, signer_user_id: namedSigner ? null : userId, signer_email: signerEmail, signer_name: signerName }];
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

    if (namedSigner) return { url: null, agreementId: request.id, reused: false, sentTo: namedSigner.name };
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
  .validator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
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
  .validator((data: unknown) => z.object({ signature_id: z.string().uuid() }).parse(data))
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
