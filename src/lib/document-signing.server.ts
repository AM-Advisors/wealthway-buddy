/**
 * Server-only: the Box-connected signing session.
 *
 * Box is the authoritative repository and runs the signing ceremony.
 * Harmonious decides who may open a session, locks the exact Box file version
 * being signed, and records completion only from Box's own status.
 *
 * Nothing here ever accepts a Box file id or a signature-request id from the
 * browser: both are resolved from the authenticated person's own records.
 */

import {
  executionState,
  publicSigner,
  refuseSession,
  requiredCapacities,
  signerStatusFromBox,
  REFUSAL_MESSAGES,
  type ExecutionState,
  type PublicSigner,
  type RefusalReason,
  type SignerCapacity,
} from "@/lib/document-signing";

export interface ResolvedSigning {
  application: { id: string; offering_id: string; user_id: string };
  document: {
    id: string;
    title: string;
    body: string;
    doc_type: string;
    requires_signature: boolean;
    file_path: string | null;
    offering_id: string;
  };
  offering: { id: string; name: string; reg_type: string } | null;
  subscription: { commitment_cents: number | null; tax_classification: string | null } | null;
  profile: { legal_name: string | null; email: string | null };
  investmentProfileId: string | null;
  signature: any | null;
  signers: any[];
}

export class SigningRefusal extends Error {
  reason: RefusalReason;
  constructor(reason: RefusalReason) {
    super(REFUSAL_MESSAGES[reason]);
    this.reason = reason;
  }
}

function boxConfigured() {
  return Boolean(
    process.env["BOX_CLIENT_ID"] &&
      process.env["BOX_CLIENT_SECRET"] &&
      process.env["BOX_ENTERPRISE_ID"],
  );
}

/**
 * Resolves everything about a signing request from the signed-in person.
 * `supabase` is the caller's own client, so row-level security already limits
 * the application to theirs; the checks below are belt and braces.
 */
export async function resolveSigning(
  supabase: any,
  admin: any,
  userId: string,
  input: { applicationId: string; offeringDocumentId: string },
): Promise<ResolvedSigning> {
  const { data: application } = await supabase
    .from("investor_applications")
    .select("id, offering_id, user_id")
    .eq("id", input.applicationId)
    .maybeSingle();

  if (!application || application.user_id !== userId) {
    throw new SigningRefusal("not_your_document");
  }

  const { data: document } = await supabase
    .from("offering_documents")
    .select("id, title, body, doc_type, requires_signature, file_path, offering_id")
    .eq("id", input.offeringDocumentId)
    .maybeSingle();

  if (!document || document.offering_id !== application.offering_id) {
    throw new SigningRefusal("document_not_in_offering");
  }

  const [{ data: offering }, { data: subscription }, { data: profile }, { data: onboarding }] =
    await Promise.all([
      supabase
        .from("offerings")
        .select("id, name, reg_type")
        .eq("id", application.offering_id)
        .maybeSingle(),
      supabase
        .from("subscriptions")
        .select("commitment_cents, tax_classification")
        .eq("application_id", application.id)
        .maybeSingle(),
      supabase.from("profiles").select("legal_name, email").eq("user_id", userId).maybeSingle(),
      supabase
        .from("investor_onboardings")
        .select("investment_profile_id")
        .eq("application_id", application.id)
        .maybeSingle(),
    ]);

  const { data: signature } = await admin
    .from("document_signatures")
    .select("*")
    .eq("application_id", application.id)
    .eq("offering_document_id", document.id)
    .maybeSingle();

  const signers = signature
    ? ((
        await admin
          .from("document_signature_signers")
          .select("*")
          .eq("signature_id", signature.id)
          .order("signing_order", { ascending: true })
      ).data ?? [])
    : [];

  return {
    application,
    document,
    offering: offering ?? null,
    subscription: subscription ?? null,
    profile: profile ?? { legal_name: null, email: null },
    investmentProfileId: onboarding?.investment_profile_id ?? null,
    signature: signature ?? null,
    signers,
  };
}

/** The signer row belonging to this exact person, matched on identity first. */
export function signerRowFor(signers: any[], userId: string, email: string | null) {
  const byUser = signers.find((s) => s.signer_user_id === userId);
  if (byUser) return byUser;
  if (!email) return null;
  return (
    signers.find((s) => String(s.signer_email ?? "").toLowerCase() === email.toLowerCase()) ?? null
  );
}

export interface SigningCardState {
  documentId: string;
  title: string;
  requiresSignature: boolean;
  state: ExecutionState;
  signers: PublicSigner[];
  /** True when this person still has a signature outstanding on the document. */
  youMustSign: boolean;
  yourStatus: string;
  signedAt: string | null;
  signatureId: string | null;
  /** Present only once the signed copy exists in Box. */
  signedDocumentAvailable: boolean;
  provider: "box_sign" | "internal";
}

/** What the investor's document card shows. No Box ids, no signing URLs. */
export function cardState(resolved: ResolvedSigning, userId: string): SigningCardState {
  const signers = resolved.signers.map(publicSigner);
  const mine = signerRowFor(resolved.signers, userId, resolved.profile.email);
  const state = resolved.signature ? executionState(resolved.signers) : "not_sent";

  return {
    documentId: resolved.document.id,
    title: resolved.document.title,
    requiresSignature: Boolean(resolved.document.requires_signature),
    state,
    signers,
    youMustSign:
      Boolean(resolved.document.requires_signature) &&
      (!mine || !["signed", "declined"].includes(String(mine.status))),
    yourStatus: String(mine?.status ?? "pending"),
    signedAt: resolved.signature?.provider_completed_at ?? null,
    signatureId: resolved.signature?.id ?? null,
    signedDocumentAvailable: Boolean(
      resolved.signature?.provider_completed_at &&
        (resolved.signature?.box_file_id || resolved.signature?.pdf_path),
    ),
    provider: boxConfigured() ? "box_sign" : "internal",
  };
}

/** Builds (or reuses) the authoritative PDF in Box and returns its file + version. */
async function ensureBoxSourceFile(
  admin: any,
  resolved: ResolvedSigning,
): Promise<{ fileId: string; versionId: string | null }> {
  const { uploadFile, fileVersionId } = await import("@/lib/box.server");

  let bytes: Uint8Array | null = null;
  if (resolved.document.file_path) {
    const download = await admin.storage
      .from("offering-files")
      .download(resolved.document.file_path);
    if (download.data) bytes = new Uint8Array(await download.data.arrayBuffer());
  }

  if (!bytes) {
    const { buildOfferingPdf } = await import("@/lib/offering-pdf.server");
    bytes = await buildOfferingPdf({
      offeringName: resolved.offering?.name ?? "Harmonious",
      regType: resolved.offering?.reg_type ?? "506b",
      title: resolved.document.title,
      docType: resolved.document.doc_type,
      body: resolved.document.body,
      requiresSignature: true,
    });
  }

  const safeTitle = resolved.document.title.replace(/[^\w\- ]+/g, "").trim() || "Fund document";
  const who = resolved.profile.legal_name ?? resolved.profile.email ?? "Investor";
  const fileName = `${safeTitle} — ${who} — ${resolved.application.id.slice(0, 8)}.pdf`;

  const fileId = await uploadFile(fileName, bytes);
  const versionId = await fileVersionId(fileId).catch(() => null);
  return { fileId, versionId };
}

export interface OpenSessionResult {
  /** Box's own embedded signing ceremony for this verified signer only. */
  signingUrl: string;
  signRequestId: string;
  reused: boolean;
}

/**
 * Opens the signing ceremony for the authenticated signer.
 *
 * Every fact is re-resolved here: the person, their application, the document,
 * the subscription, whether they are a required signer, whether the signature
 * is still outstanding, and whether the locked document version still stands.
 */
export async function openSigningSession(
  supabase: any,
  admin: any,
  userId: string,
  input: { applicationId: string; offeringDocumentId: string },
): Promise<OpenSessionResult> {
  const resolved = await resolveSigning(supabase, admin, userId, input);
  const mine = signerRowFor(resolved.signers, userId, resolved.profile.email);

  // No request yet: the investor is the required signer on their own agreement.
  const isRequiredSigner = resolved.signers.length === 0 ? true : Boolean(mine);

  const refusal = refuseSession({
    applicationBelongsToUser: resolved.application.user_id === userId,
    documentInOffering: resolved.document.offering_id === resolved.application.offering_id,
    hasSubscription: Boolean(resolved.subscription?.commitment_cents),
    requiresSignature: Boolean(resolved.document.requires_signature),
    isRequiredSigner,
    signerStatus: mine?.status ?? "pending",
    providerConfigured: boxConfigured(),
  });
  if (refusal) throw new SigningRefusal(refusal);

  if (!resolved.profile.email) throw new SigningRefusal("not_a_required_signer");

  const { getSignRequestDetail, createMultiSignerRequest } = await import("@/lib/box.server");

  // Reuse the live Box request rather than sending a duplicate. The version it
  // was locked to stays exactly as it was, whatever happened to the source.
  const agreementId = resolved.signature?.provider_agreement_id as string | undefined;
  if (agreementId && resolved.signature?.provider_status === "out_for_signature") {
    const live = await getSignRequestDetail(agreementId).catch(() => null);
    const liveSigner = live?.signers.find(
      (s) => s.email === String(resolved.profile.email).toLowerCase(),
    );
    if (liveSigner?.embedUrl) {
      await syncSignersFromBox(admin, agreementId);
      return { signingUrl: liveSigner.embedUrl, signRequestId: agreementId, reused: true };
    }
  }

  const { fileId, versionId } = await ensureBoxSourceFile(admin, resolved);
  const now = new Date().toISOString();
  const capacity: SignerCapacity =
    requiredCapacities(resolved.subscription?.tax_classification)[0] ?? "individual";

  const signerName = resolved.profile.legal_name ?? resolved.profile.email;
  const detail = await createMultiSignerRequest({
    fileId,
    documentName: `${resolved.offering?.name ?? "Harmonious"} — ${resolved.document.title}`,
    message: `Please review and sign ${resolved.document.title} for ${resolved.offering?.name ?? "the fund"}.`,
    externalId: `${resolved.application.id}:${resolved.document.id}`,
    redirectUrl: "https://app.harmonious.co/portal",
    signers: [
      {
        email: resolved.profile.email,
        name: signerName,
        order: 1,
        externalUserId: `${resolved.application.id}:${resolved.document.id}:${userId}`,
      },
    ],
  });

  const row = {
    application_id: resolved.application.id,
    offering_document_id: resolved.document.id,
    signer_name: signerName,
    signer_email: resolved.profile.email,
    signer_capacity: capacity,
    investment_profile_id: resolved.investmentProfileId,
    signature_type: "box_sign",
    signature_value: detail.id,
    consent_electronic: true,
    document_hash: "",
    provider: "box_sign",
    provider_agreement_id: detail.id,
    provider_status: "out_for_signature",
    provider_source_file_id: fileId,
    source_file_version_id: detail.sourceFileVersionId ?? versionId,
    locked_at: now,
    provider_last_event_at: now,
    provider_sent_at: now,
    provider_completed_at: null,
    provider_declined_at: null,
    cancelled_at: null,
    signed_at: now,
  };

  let signatureId: string = resolved.signature?.id ?? "";
  if (signatureId) {
    const { error } = await admin.from("document_signatures").update(row).eq("id", signatureId);
    if (error) throw new Error(error.message);
  } else {
    const { data: inserted, error } = await admin
      .from("document_signatures")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    signatureId = inserted.id;
  }

  // One signer row per required signer. Identity first: the person and their
  // investment profile, not just an email address.
  await admin.from("document_signature_signers").upsert(
    [
      {
        signature_id: signatureId,
        application_id: resolved.application.id,
        offering_document_id: resolved.document.id,
        offering_id: resolved.application.offering_id,
        signer_user_id: userId,
        investment_profile_id: resolved.investmentProfileId,
        signer_email: resolved.profile.email,
        signer_name: signerName,
        signer_capacity: capacity,
        signing_order: 1,
        required: true,
        status: "sent",
        provider_signer_id: `${resolved.application.id}:${resolved.document.id}:${userId}`,
        sent_at: now,
        last_event_at: now,
      },
    ],
    { onConflict: "signature_id,signer_email", ignoreDuplicates: false },
  );

  await admin.from("signature_audit_events").insert({
    application_id: resolved.application.id,
    signature_id: signatureId,
    event_type: "box_sign_sent",
    metadata: {
      sign_request_id: detail.id,
      box_file_id: fileId,
      box_file_version_id: detail.sourceFileVersionId ?? versionId,
      document_title: resolved.document.title,
      signer_capacity: capacity,
    },
  });

  const mySigner = detail.signers.find(
    (s) => s.email === String(resolved.profile.email).toLowerCase(),
  );
  if (!mySigner?.embedUrl) throw new SigningRefusal("provider_unavailable");

  return { signingUrl: mySigner.embedUrl, signRequestId: detail.id, reused: false };
}

/**
 * Brings our signer rows in line with Box. Box is the only authority for who
 * has signed: closing a modal or reaching a success screen changes nothing.
 */
export async function syncSignersFromBox(
  admin: any,
  signRequestId: string,
): Promise<{ updated: number; state: ExecutionState | null }> {
  const { getSignRequestDetail } = await import("@/lib/box.server");

  const { data: signature } = await admin
    .from("document_signatures")
    .select("id, application_id, offering_document_id")
    .eq("provider_agreement_id", signRequestId)
    .maybeSingle();
  if (!signature) return { updated: 0, state: null };

  const detail = await getSignRequestDetail(signRequestId).catch(() => null);
  if (!detail) return { updated: 0, state: null };

  const { data: rows } = await admin
    .from("document_signature_signers")
    .select("*")
    .eq("signature_id", signature.id);

  const now = new Date().toISOString();
  let updated = 0;

  for (const row of (rows ?? []) as any[]) {
    // A completed signature is never rewritten.
    if (row.status === "signed") continue;

    const remote = detail.signers.find(
      (s) => s.email === String(row.signer_email ?? "").toLowerCase(),
    );
    if (!remote) continue;

    const status = signerStatusFromBox(detail.status, {
      decision: remote.decision,
      viewed: remote.viewed,
    });
    if (status === row.status) continue;

    const patch: Record<string, unknown> = { status, last_event_at: now };
    if (status === "viewed" && !row.viewed_at) patch["viewed_at"] = now;
    if (status === "signed") {
      patch["signed_at"] = remote.signedAt ?? now;
      patch["viewed_at"] = row.viewed_at ?? remote.signedAt ?? now;
    }
    if (status === "declined") patch["declined_at"] = now;

    await admin.from("document_signature_signers").update(patch).eq("id", row.id);
    updated += 1;
  }

  if (detail.signedFileId) {
    await admin
      .from("document_signatures")
      .update({ signed_file_version_id: detail.signedFileVersionId })
      .eq("id", signature.id);
  }

  const { data: after } = await admin
    .from("document_signature_signers")
    .select("status, required")
    .eq("signature_id", signature.id);

  return { updated, state: executionState((after ?? []) as any[]) };
}
