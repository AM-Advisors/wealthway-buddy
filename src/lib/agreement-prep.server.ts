/**
 * Server-only: preparing an agreement for signature.
 *
 * Preparation decides *who signs* and *where the Box Sign fields go*. Sending
 * hands that configuration to Box Sign natively. Box still owns the document,
 * the ceremony and the completion; nothing here can mark anything signed.
 *
 * Authorization is always resolved from the real fund/company relationship of
 * the signed-in person — never from an email address, a hostname or the menu.
 */

import {
  boxInputsByRole,
  canPrepare,
  capacityForRole,
  preparationAllowed,
  roleLabel,
  validateLayout,
  type PlacedField,
  type PrefillContext,
  type PreparerActor,
  type PrepareTarget,
  type TemplateRole,
} from "@/lib/agreement-prep";
import { executionState } from "@/lib/document-signing";

export class PrepRefusal extends Error {}

function refuse(message: string): never {
  throw new PrepRefusal(message);
}

/* --------------------------------------------------------------- the actor */

/**
 * Everything the signed-in person is actually authorized to prepare.
 * `supabase` is their own client, so the fund and company reads are already
 * limited by row-level security; the results are then checked explicitly.
 */
export async function resolvePreparer(
  context: any,
  capabilities: readonly string[] = [],
): Promise<PreparerActor> {
  const { supabase, userId } = context;

  const [{ data: funds }, { data: companies }] = await Promise.all([
    supabase.from("fund_managers").select("offering_id").eq("user_id", userId),
    supabase.from("ct_companies").select("id"),
  ]);

  return {
    userId,
    capabilities,
    offeringIds: ((funds ?? []) as any[]).map((f) => String(f.offering_id)),
    companyIds: ((companies ?? []) as any[]).map((c) => String(c.id)),
  };
}

/** Staff capabilities, if this person holds any. Clients simply get none. */
export async function staffCapabilities(context: any): Promise<string[]> {
  const { requireOperations } = await import("@/lib/ops-access.functions");
  try {
    const { capabilities } = await requireOperations(context);
    return capabilities as unknown as string[];
  } catch {
    return [];
  }
}

export function assertCanPrepare(actor: PreparerActor, target: PrepareTarget) {
  if (!canPrepare(actor, target)) {
    refuse("Forbidden: you are not authorized to prepare agreements here.");
  }
}

/* ------------------------------------------------------------- templates */

export interface TemplateRecord {
  id: string;
  scope: "harmonious" | "fund" | "company";
  offeringId: string | null;
  companyId: string | null;
  agreementType: string;
  name: string;
  status: string;
  currentVersion: number;
  canEdit: boolean;
  versions: {
    id: string;
    versionNo: number;
    status: string;
    roles: TemplateRole[];
    fields: PlacedField[];
    publishedAt: string | null;
    offeringDocumentId: string | null;
  }[];
}

/** Templates this person may see, with their versions. */
export async function listTemplates(
  admin: any,
  actor: PreparerActor,
  filter: { offeringId?: string | null; companyId?: string | null } = {},
): Promise<TemplateRecord[]> {
  let query = admin.from("signing_templates").select("*").order("created_at", { ascending: false });
  if (filter.offeringId) query = query.eq("offering_id", filter.offeringId);
  if (filter.companyId) query = query.eq("company_id", filter.companyId);

  const { data: templates } = await query;
  const visible = ((templates ?? []) as any[]).filter((t) =>
    canPrepare(actor, {
      scope: t.scope,
      offeringId: t.offering_id,
      companyId: t.company_id,
    }) || (t.scope === "harmonious" && (actor.offeringIds.length > 0 || actor.companyIds.length > 0)),
  );
  if (visible.length === 0) return [];

  const { data: versions } = await admin
    .from("signing_template_versions")
    .select("*")
    .in(
      "template_id",
      visible.map((t) => t.id),
    )
    .order("version_no", { ascending: false });

  return visible.map((t) => ({
    id: String(t.id),
    scope: t.scope,
    offeringId: t.offering_id ?? null,
    companyId: t.company_id ?? null,
    agreementType: String(t.agreement_type ?? "other"),
    name: String(t.name ?? "Signing template"),
    status: String(t.status ?? "active"),
    currentVersion: Number(t.current_version ?? 0),
    canEdit: canPrepare(actor, {
      scope: t.scope,
      offeringId: t.offering_id,
      companyId: t.company_id,
    }),
    versions: ((versions ?? []) as any[])
      .filter((v) => v.template_id === t.id)
      .map((v) => ({
        id: String(v.id),
        versionNo: Number(v.version_no),
        status: String(v.status),
        roles: (v.roles ?? []) as TemplateRole[],
        fields: (v.fields ?? []) as PlacedField[],
        publishedAt: v.published_at ?? null,
        offeringDocumentId: v.offering_document_id ?? null,
      })),
  }));
}

export interface SaveTemplateInput {
  templateId?: string | null;
  scope: "harmonious" | "fund" | "company";
  offeringId?: string | null;
  companyId?: string | null;
  agreementType: string;
  name: string;
  roles: TemplateRole[];
  fields: PlacedField[];
  offeringDocumentId?: string | null;
  publish: boolean;
}

/**
 * Saves a field layout as a new template version. A published version is never
 * edited in place — outstanding requests stay on the version they were sent
 * with, and the next version only affects requests sent afterwards.
 */
export async function saveTemplateVersion(
  admin: any,
  actor: PreparerActor,
  input: SaveTemplateInput,
): Promise<{ templateId: string; versionId: string; versionNo: number }> {
  assertCanPrepare(actor, {
    scope: input.scope,
    offeringId: input.offeringId,
    companyId: input.companyId,
  });

  const problems = validateLayout({ roles: input.roles, fields: input.fields });
  if (input.publish && problems.length > 0) refuse(problems[0]!.message);

  let templateId = input.templateId ?? null;
  if (templateId) {
    const { data: existing } = await admin
      .from("signing_templates")
      .select("id, scope, offering_id, company_id")
      .eq("id", templateId)
      .maybeSingle();
    if (!existing) refuse("That signing template no longer exists.");
    // Scope comes from the stored template, never from the browser.
    assertCanPrepare(actor, {
      scope: existing.scope,
      offeringId: existing.offering_id,
      companyId: existing.company_id,
    });
  } else {
    const { data: created, error } = await admin
      .from("signing_templates")
      .insert({
        scope: input.scope,
        offering_id: input.scope === "fund" ? input.offeringId : null,
        company_id: input.scope === "company" ? input.companyId : null,
        agreement_type: input.agreementType,
        name: input.name,
        created_by: actor.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    templateId = String(created.id);
  }

  const { data: last } = await admin
    .from("signing_template_versions")
    .select("version_no")
    .eq("template_id", templateId)
    .order("version_no", { ascending: false })
    .limit(1);
  const versionNo = Number((last ?? [])[0]?.version_no ?? 0) + 1;
  const now = new Date().toISOString();

  const { data: version, error: versionError } = await admin
    .from("signing_template_versions")
    .insert({
      template_id: templateId,
      version_no: versionNo,
      status: input.publish ? "published" : "draft",
      roles: input.roles,
      fields: input.fields,
      offering_document_id: input.offeringDocumentId ?? null,
      prepared_by: actor.userId,
      published_by: input.publish ? actor.userId : null,
      published_at: input.publish ? now : null,
    })
    .select("id")
    .single();
  if (versionError) throw new Error(versionError.message);

  if (input.publish) {
    await admin
      .from("signing_templates")
      .update({ current_version: versionNo, name: input.name, updated_at: now })
      .eq("id", templateId);
  }

  return { templateId: String(templateId), versionId: String(version.id), versionNo };
}

/* ------------------------------------------------------- preparing a send */

export interface SendSignerInput {
  roleKey: string;
  name: string;
  email: string;
  order: number;
  required: boolean;
}

export interface SendPreparedInput {
  applicationId: string;
  offeringDocumentId: string;
  templateVersionId?: string | null;
  roles: TemplateRole[];
  fields: PlacedField[];
  signers: SendSignerInput[];
  message?: string | null;
}

/** Builds (or refreshes) the authoritative source PDF in Box for this agreement. */
async function ensureSourceFile(
  admin: any,
  doc: any,
  offering: any,
  investorLabel: string,
  applicationId: string,
): Promise<{ fileId: string; versionId: string | null }> {
  const { uploadFile, fileVersionId } = await import("@/lib/box.server");

  let bytes: Uint8Array | null = null;
  if (doc.file_path) {
    const download = await admin.storage.from("offering-files").download(doc.file_path);
    if (download.data) bytes = new Uint8Array(await download.data.arrayBuffer());
  }
  if (!bytes) {
    const { buildOfferingPdf } = await import("@/lib/offering-pdf.server");
    bytes = await buildOfferingPdf({
      offeringName: offering?.name ?? "Harmonious",
      regType: offering?.reg_type ?? "506b",
      title: doc.title,
      docType: doc.doc_type,
      body: doc.body,
      requiresSignature: true,
    });
  }

  const safeTitle = String(doc.title ?? "Fund document").replace(/[^\w\- ]+/g, "").trim();
  const fileName = `${safeTitle || "Fund document"} — ${investorLabel} — ${applicationId.slice(0, 8)}.pdf`;
  const fileId = await uploadFile(fileName, bytes);
  const versionId = await fileVersionId(fileId).catch(() => null);
  return { fileId, versionId };
}

/**
 * Sends a prepared agreement through Box Sign.
 *
 * Authorization is rechecked here at send time — the preparation screen is not
 * trusted for anything. Every signer, capacity and field placement is written
 * down as sent, and the exact Box file version is locked to the request.
 */
export async function sendPreparedAgreement(
  context: any,
  admin: any,
  actor: PreparerActor,
  input: SendPreparedInput,
): Promise<{ signatureId: string; signRequestId: string; signerCount: number }> {
  const { data: doc } = await admin
    .from("offering_documents")
    .select("id, offering_id, title, body, doc_type, requires_signature, file_path, created_by")
    .eq("id", input.offeringDocumentId)
    .maybeSingle();
  if (!doc) refuse("That agreement no longer exists.");
  if (!doc.requires_signature) refuse("That document does not require a signature.");

  // Authority comes from the fund the document actually belongs to.
  assertCanPrepare(actor, { scope: "fund", offeringId: String(doc.offering_id) });

  const { data: application } = await admin
    .from("investor_applications")
    .select("id, offering_id, user_id")
    .eq("id", input.applicationId)
    .maybeSingle();
  if (!application) refuse("That investor record no longer exists.");
  if (String(application.offering_id) !== String(doc.offering_id)) {
    refuse("That agreement does not belong to this investor's fund.");
  }

  const problems = validateLayout({ roles: input.roles, fields: input.fields });
  if (problems.length > 0) refuse(problems[0]!.message);

  for (const signer of input.signers) {
    if (!input.roles.some((r) => r.key === signer.roleKey)) {
      refuse("A signer was given a role that is not on this agreement.");
    }
  }
  for (const role of input.roles.filter((r) => r.required !== false)) {
    if (!input.signers.some((s) => s.roleKey === role.key && s.email)) {
      refuse(`Choose who signs as ${roleLabel(role.key)}.`);
    }
  }

  const { data: signature } = await admin
    .from("document_signatures")
    .select("*")
    .eq("application_id", application.id)
    .eq("offering_document_id", doc.id)
    .maybeSingle();

  if (signature) {
    const { data: existingSigners } = await admin
      .from("document_signature_signers")
      .select("status, required")
      .eq("signature_id", signature.id);
    const state = executionState((existingSigners ?? []) as any[]);
    const verdict = preparationAllowed(state);
    if (!verdict.allowed) refuse(verdict.reason ?? "This agreement cannot be prepared again.");
  }

  const [{ data: offering }, { data: subscription }, { data: onboarding }, { data: investor }] =
    await Promise.all([
      admin.from("offerings").select("id, name, reg_type").eq("id", doc.offering_id).maybeSingle(),
      admin
        .from("subscriptions")
        .select("commitment_cents, tax_classification, entity_name")
        .eq("application_id", application.id)
        .maybeSingle(),
      admin
        .from("investor_onboardings")
        .select("investment_profile_id")
        .eq("application_id", application.id)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("legal_name, email")
        .eq("user_id", application.user_id)
        .maybeSingle(),
    ]);

  const investorLabel =
    subscription?.entity_name ?? investor?.legal_name ?? investor?.email ?? "Investor";

  const prefillFor = (roleKey: string): PrefillContext => {
    const signer = input.signers.find((s) => s.roleKey === roleKey);
    return {
      legalInvestorName: investor?.legal_name ?? null,
      investingEntity: subscription?.entity_name ?? investor?.legal_name ?? null,
      signerName: signer?.name ?? null,
      signerTitle: roleLabel(roleKey),
      fundName: offering?.name ?? null,
      commitmentCents: subscription?.commitment_cents ?? null,
    };
  };

  const inputsByRole = boxInputsByRole({ fields: input.fields, prefillFor });
  const { fileId, versionId } = await ensureSourceFile(
    admin,
    doc,
    offering,
    investorLabel,
    application.id,
  );

  const { createMultiSignerRequest } = await import("@/lib/box.server");
  const ordered = [...input.signers].sort((a, b) => a.order - b.order);

  const detail = await createMultiSignerRequest({
    fileId,
    documentName: `${offering?.name ?? "Harmonious"} — ${doc.title}`,
    message:
      input.message ??
      `Please review and sign ${doc.title} for ${offering?.name ?? "the fund"}.`,
    externalId: `${application.id}:${doc.id}`,
    redirectUrl: "https://app.harmonious.co/portal",
    signers: ordered.map((s, index) => ({
      email: s.email,
      name: s.name,
      order: index + 1,
      externalUserId: `${application.id}:${doc.id}:${s.roleKey}`,
      inputs: (inputsByRole[s.roleKey] ?? []) as unknown as Record<string, unknown>[],
    })),
  });

  const now = new Date().toISOString();
  const row = {
    application_id: application.id,
    offering_document_id: doc.id,
    signer_name: ordered[0]?.name ?? investorLabel,
    signer_email: ordered[0]?.email ?? investor?.email ?? "",
    signer_capacity: capacityForRole(ordered[0]?.roleKey ?? "investor"),
    investment_profile_id: onboarding?.investment_profile_id ?? null,
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
    // Four distinct parties, all preserved.
    document_author: doc.created_by ?? null,
    prepared_by: actor.userId,
    prepared_at: now,
    sent_by: actor.userId,
    template_version_id: input.templateVersionId ?? null,
    placed_fields: input.fields,
  };

  let signatureId = signature?.id ?? "";
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
    signatureId = String(inserted.id);
  }

  // Re-seed the signer rows for this send. Completed rows are protected in the
  // database, so an executed agreement can never be rewritten from here.
  await admin
    .from("document_signature_signers")
    .delete()
    .eq("signature_id", signatureId)
    .neq("status", "signed");

  const emails = ordered.map((s) => s.email.toLowerCase());
  const { data: matchedProfiles } = emails.length
    ? await admin.from("profiles").select("user_id, email").in("email", emails)
    : { data: [] as any[] };
  const userIdByEmail = new Map(
    ((matchedProfiles ?? []) as any[]).map((p) => [String(p.email).toLowerCase(), p.user_id]),
  );

  await admin.from("document_signature_signers").upsert(
    ordered.map((s, index) => ({
      signature_id: signatureId,
      application_id: application.id,
      offering_document_id: doc.id,
      offering_id: application.offering_id,
      signer_user_id: userIdByEmail.get(s.email.toLowerCase()) ?? null,
      investment_profile_id: onboarding?.investment_profile_id ?? null,
      signer_email: s.email,
      signer_name: s.name,
      signer_capacity: capacityForRole(s.roleKey),
      role_key: s.roleKey,
      signing_order: index + 1,
      required: s.required !== false,
      status: "sent",
      provider_signer_id: `${application.id}:${doc.id}:${s.roleKey}`,
      sent_at: now,
      last_event_at: now,
    })),
    { onConflict: "signature_id,signer_email", ignoreDuplicates: false },
  );

  await admin.from("signature_audit_events").insert({
    application_id: application.id,
    signature_id: signatureId,
    event_type: "agreement_prepared_and_sent",
    metadata: {
      sign_request_id: detail.id,
      box_file_id: fileId,
      box_file_version_id: detail.sourceFileVersionId ?? versionId,
      template_version_id: input.templateVersionId ?? null,
      document_author: doc.created_by ?? null,
      prepared_by: actor.userId,
      sent_by: actor.userId,
      signers: ordered.map((s) => ({ role: s.roleKey, order: s.order, capacity: capacityForRole(s.roleKey) })),
      field_count: input.fields.length,
      document_title: doc.title,
    },
  });

  void context;
  return { signatureId, signRequestId: detail.id, signerCount: ordered.length };
}
