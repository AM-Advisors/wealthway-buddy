// Server-only: finalises a Box Sign request into our own records.
// Downloads the signed PDF from Box, keeps a copy for fast in-app downloads,
// timestamps the signature row, advances the application, and alerts the
// assigned fund manager once.

import { downloadFile, getSignRequest, mapSignStatus } from "@/lib/box.server";

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface SyncResult {
  status: string;
  completed: boolean;
  signatureId: string | null;
}

export async function syncBoxSignRequest(
  signRequestId: string,
  opts: { status?: string; completedAt?: string } = {},
): Promise<SyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: signature } = await supabaseAdmin
    .from("document_signatures")
    .select(
      "id, application_id, offering_document_id, signer_name, pdf_path, provider_completed_at, provider_viewed_at",
    )
    .eq("provider_agreement_id", signRequestId)
    .maybeSingle();

  if (!signature) return { status: "unknown_sign_request", completed: false, signatureId: null };

  const remote = await getSignRequest(signRequestId).catch(() => null);
  const rawStatus = remote?.status ?? opts.status ?? "unknown";
  const mapped = mapSignStatus(rawStatus);
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = {
    provider_status: mapped,
    provider_last_event_at: now,
  };

  // First time Box tells us the signer opened the document, stamp it once.
  const alreadyViewed = (signature as any).provider_viewed_at as string | null;
  const openedNow =
    remote?.viewed || String(opts.status ?? "").toLowerCase().includes("view") || mapped === "completed";
  if (!alreadyViewed && openedNow) {
    patch["provider_viewed_at"] = remote?.viewedAt ?? opts.completedAt ?? now;
  }

  if (mapped === "completed" && remote?.signedFileId) {
    const completedAt = opts.completedAt ?? now;
    const pdfBytes = await downloadFile(remote.signedFileId);
    const hash = await sha256Hex(pdfBytes);

    const { data: app } = await supabaseAdmin
      .from("investor_applications")
      .select("id, user_id, offering_id")
      .eq("id", signature.application_id)
      .maybeSingle();

    const pdfPath = `${app?.user_id ?? "unknown"}/${signature.application_id}/${signature.offering_document_id}.pdf`;
    const upload = await supabaseAdmin.storage
      .from("signed-documents")
      .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upload.error) throw new Error(upload.error.message);

    patch["pdf_path"] = pdfPath;
    patch["document_hash"] = hash;
    patch["signed_at"] = completedAt;
    patch["provider_completed_at"] = completedAt;
    patch["provider_file_id"] = remote.signedFileId;
    // The certified copy already lives in Box — record it as archived, stamped.
    patch["box_file_id"] = remote.signedFileId;
    patch["box_uploaded_at"] = completedAt;
    patch["box_error"] = null;
  }

  // Per-signer truth from Box (dual signature). Idempotent: replays write the same values.
  await syncSignerRows(signature.id, signRequestId).catch((e) => console.error("[box-sign] signer rows", e));

  const { error: updateError } = await supabaseAdmin
    .from("document_signatures")
    .update(patch as never)
    .eq("id", signature.id);
  if (updateError) throw new Error(updateError.message);

  await supabaseAdmin.from("signature_audit_events").insert({
    application_id: signature.application_id,
    signature_id: signature.id,
    event_type: mapped === "completed" ? "box_sign_completed" : `box_sign_${mapped}`,
    metadata: { sign_request_id: signRequestId, box_status: rawStatus },
  });

  if (mapped === "completed") {
    await advanceApplication(signature.application_id);
    if (!signature.provider_completed_at) {
      await notifyManagers(signature.id, signature.application_id, signature.offering_document_id);
    }
  }

  return { status: mapped, completed: mapped === "completed", signatureId: signature.id };
}

/** Marks documents complete once every required document has a completed signature. */
async function advanceApplication(applicationId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();

  const { data: application } = await supabaseAdmin
    .from("investor_applications")
    .select("id, offering_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!application) return;

  const { data: required } = await supabaseAdmin
    .from("offering_documents")
    .select("id")
    .eq("offering_id", application.offering_id)
    .eq("requires_signature", true);

  const { data: signed } = await supabaseAdmin
    .from("document_signatures")
    .select("offering_document_id, provider, provider_status")
    .eq("application_id", applicationId);

  const done = new Set(
    (signed ?? [])
      .filter((s: any) => s.provider !== "box_sign" || s.provider_status === "completed")
      .map((s: any) => s.offering_document_id),
  );
  const allSigned = (required ?? []).every((r: any) => done.has(r.id));

  await supabaseAdmin
    .from("investor_applications")
    .update({
      documents_status: allSigned ? "approved" : "pending",
      ...(allSigned ? { current_step: "funding" } : {}),
      updated_at: now,
    })
    .eq("id", applicationId);

  if (allSigned) {
    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "signed", updated_at: now })
      .eq("application_id", applicationId);
  }
}

/** Emails the fund's assigned managers that a document is signed. */
async function notifyManagers(signatureId: string, applicationId: string, offeringDocumentId: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: application } = await supabaseAdmin
      .from("investor_applications")
      .select("id, user_id, offering_id, commitment_cents")
      .eq("id", applicationId)
      .maybeSingle();
    if (!application) return;

    const [{ data: offering }, { data: doc }, { data: investor }] = await Promise.all([
      supabaseAdmin.from("offerings").select("name").eq("id", application.offering_id).maybeSingle(),
      supabaseAdmin.from("offering_documents").select("title").eq("id", offeringDocumentId).maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("legal_name, email")
        .eq("user_id", application.user_id)
        .maybeSingle(),
    ]);

    const { data: assignments } = await supabaseAdmin
      .from("fund_managers")
      .select("user_id")
      .eq("offering_id", application.offering_id);

    const managerIds = (assignments ?? []).map((a: any) => a.user_id as string);

    const { data: managers } = managerIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("user_id, legal_name, email")
          .in("user_id", managerIds)
      : { data: [] as any[] };

    // If no manager is assigned to this fund yet, the alert still has to land
    // somewhere, so fall back to the admins and finally to operations.
    let recipients = (managers ?? []).filter((m: any) => m.email);
    if (recipients.length === 0) {
      const { data: adminRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const adminIds = (adminRoles ?? []).map((a: any) => a.user_id as string);
      const { data: admins } = adminIds.length
        ? await supabaseAdmin
            .from("profiles")
            .select("user_id, legal_name, email")
            .in("user_id", adminIds)
        : { data: [] as any[] };
      recipients = (admins ?? []).filter((a: any) => a.email);
    }
    if (recipients.length === 0) {
      recipients = [{ legal_name: "Harmonious operations", email: "operations@harmonious.co" }];
    }


    const signedAt = new Date().toISOString();
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");

    for (const manager of recipients) {
      if (!manager.email) continue;
      await sendTemplateEmail("document-signed", manager.email, {
        templateData: {
          managerName: manager.legal_name ?? "there",
          investorName: investor?.legal_name ?? "An investor",
          offeringName: offering?.name ?? "your fund",
          documentTitle: doc?.title ?? "Fund document",
          signedAt,
          commitmentCents: application.commitment_cents ?? 0,
          portalUrl: `https://app.harmonious.co/manager/${applicationId}`,
        },
        idempotencyKey: `doc-signed-${signatureId}-${manager.email}`,
      }).catch((e) => console.error("[box-sign] manager email failed", e));
    }


    await supabaseAdmin
      .from("document_signatures")
      .update({ manager_notified_at: signedAt })
      .eq("id", signatureId);
  } catch (e) {
    console.error("[box-sign] manager notification failed", e);
  }
}


async function syncSignerRows(signatureId: string, signRequestId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("document_signature_signers")
    .select("id, signer_email, role_key, signing_order, status, signed_at")
    .eq("signature_id", signatureId);
  if (!rows?.length) return;
  const { getSignRequestDetail } = await import("@/lib/box.server");
  const detail = await getSignRequestDetail(signRequestId);
  const now = new Date().toISOString();
  const byEmail = new Map(detail.signers.map((s) => [s.email, s]));
  const investorSigned = rows.some((r: any) => r.role_key === "investor" && (r.status === "signed" || byEmail.get(String(r.signer_email).toLowerCase())?.decision === "signed"));
  for (const r of rows as any[]) {
    const remote = byEmail.get(String(r.signer_email ?? "").toLowerCase());
    let status = r.status as string;
    if (remote?.decision === "signed") status = "signed";
    else if (remote?.decision === "declined") status = "declined";
    else if (r.role_key === "fund_manager" && investorSigned && status === "waiting") status = "sent";
    if (status === r.status) continue;
    await supabaseAdmin
      .from("document_signature_signers")
      .update({
        status,
        last_event_at: now,
        ...(status === "signed" && !r.signed_at ? { signed_at: remote?.signedAt ?? now } : {}),
        ...(status === "declined" ? { declined_at: now } : {}),
        ...(status === "sent" ? { sent_at: now } : {}),
      } as never)
      .eq("id", r.id);
  }
}
