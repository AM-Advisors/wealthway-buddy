import { canonicalExecutionStatus } from "@/lib/document-execution-status";
/**
 * Offering Documents in Fund Setup. Staff configure; managers of the exact fund
 * read; investors see only documents that apply to their own Investment.
 * No provider calls here — signing still runs through the existing Box flow.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { setupActor, forbid } from "@/lib/fund-setup.server";
import {
  DOCUMENT_CATEGORY_LABELS,
  documentApplies,
  toOfferingExecutionState,
  investorDocumentAction,
  offeringDocumentsSetupStatus,
  signingConfigErrors,
  signingStatusForNewVersion,
  versionChangeImpact,
  versionState,
  type Applicability,
  type DocumentCategory,
  type DocumentUsage,
  type SigningConfig,
} from "@/lib/offering-document-model";

const db = () => supabaseAdmin as any;
const now = () => new Date().toISOString();

async function assertRead(userId: string, offeringId: string) {
  const a = await setupActor(userId);
  if (!a.isStaff && !a.offeringIds.includes(offeringId)) forbid("you do not manage that fund.");
  return a;
}
async function assertStaff(userId: string, offeringId: string) {
  const a = await assertRead(userId, offeringId);
  if (!a.isStaff) forbid("only Harmonious can configure offering documents.");
  return a;
}
async function docRow(documentId: string) {
  const { data } = await db().from("offering_documents").select("*").eq("id", documentId).maybeSingle();
  if (!data) throw new Error("That document was not found.");
  return data;
}
async function event(offeringId: string, documentId: string | null, version: number | null, ev: string, actor: string, detail: Record<string, unknown> = {}) {
  await db().from("offering_document_events").insert({ offering_id: offeringId, offering_document_id: documentId, version, event: ev, actor_user_id: actor, detail });
}

export async function listSetupDocuments(userId: string, offeringId: string) {
  const actor = await assertRead(userId, offeringId);
  const [{ data: docs }, { data: versions }] = await Promise.all([
    db().from("offering_documents").select("id, title, doc_type, document_category, usage, applicability, active_version, current_version, requires_signature").eq("offering_id", offeringId).order("sort_order"),
    db().from("offering_document_versions").select("*").eq("offering_id", offeringId).order("version", { ascending: false }),
  ]);
  const vs = (versions ?? []) as any[];
  const list = ((docs ?? []) as any[]).map((d) => {
    const own = vs.filter((v) => v.offering_document_id === d.id);
    const view = own.map((v) => ({
      version: v.version,
      fileName: v.file_name,
      source: v.source,
      uploadedAt: v.created_at,
      effectiveDate: v.effective_date,
      approval: v.approval_status,
      signingStatus: v.signing_config_status,
      signingConfig: (v.signing_config ?? null) as SigningConfig | null,
      state: versionState({ approval: v.approval_status, usage: d.usage, signingStatus: v.signing_config_status }),
      isActive: d.active_version === v.version,
    }));
    return {
      id: d.id,
      title: d.title,
      category: d.document_category as DocumentCategory | null,
      usage: d.usage as DocumentUsage | null,
      applicability: (d.applicability ?? {}) as Applicability,
      activeVersion: d.active_version as number | null,
      versions: view,
    };
  });
  const status = offeringDocumentsSetupStatus(
    list.map((d) => ({
      category: d.category,
      usage: d.usage,
      activeState: d.versions.find((v) => v.isActive)?.state ?? null,
      latestState: d.versions[0]?.state ?? null,
    })),
  );
  const { data: o } = await db().from("offerings").select("fund_signatory_person_id, has_multiple_classes").eq("id", offeringId).maybeSingle();
  return { canEdit: actor.isStaff, documents: list, status, hasFundSignatory: !!o?.fund_signatory_person_id, hasMultipleClasses: !!o?.has_multiple_classes };
}

export async function createSetupDocument(userId: string, input: { offeringId: string; category: DocumentCategory; title?: string | null | undefined }) {
  await assertStaff(userId, input.offeringId);
  const title = input.category === "other" ? (input.title ?? "").trim() : DOCUMENT_CATEGORY_LABELS[input.category];
  if (!title) throw new Error("Give the document a clear name.");
  if (input.category !== "other") {
    const { data: existing } = await db().from("offering_documents").select("id").eq("offering_id", input.offeringId).eq("document_category", input.category).maybeSingle();
    if (existing) return { id: existing.id };
  }
  const { data, error } = await db()
    .from("offering_documents")
    .insert({ offering_id: input.offeringId, title, doc_type: input.category, document_category: input.category, body: "", requires_signature: false, investor_required: true })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await event(input.offeringId, data.id, null, "document_created", userId, { category: input.category });
  return { id: data.id };
}

/** Every upload appends a new version; nothing is overwritten. */
export async function uploadDocumentVersion(userId: string, input: { documentId: string; filePath: string; fileName: string; fileSizeBytes: number; effectiveDate?: string | null | undefined }) {
  const d = await docRow(input.documentId);
  await assertStaff(userId, d.offering_id);
  if (!input.filePath.startsWith(`${d.offering_id}/`)) throw new Error("That file does not belong to this fund.");
  const { data: latest } = await db().from("offering_document_versions").select("version, signing_config").eq("offering_document_id", d.id).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = Number(latest?.version ?? 0) + 1;
  const { error } = await db().from("offering_document_versions").insert({
    offering_document_id: d.id,
    offering_id: d.offering_id,
    version,
    file_name: input.fileName,
    file_path: input.filePath,
    file_size_bytes: input.fileSizeBytes,
    source: "upload",
    created_by: userId,
    effective_date: input.effectiveDate || null,
    approval_status: "uploaded_review_required",
    signing_config: null,
    signing_config_status: signingStatusForNewVersion(latest?.signing_config ?? null),
  });
  if (error) throw new Error(error.message);
  // The active version (and the file investors see) only changes on explicit activation.
  await db().from("offering_documents").update({ current_version: version, file_updated_at: now() }).eq("id", d.id);
  await event(d.offering_id, d.id, version, "version_uploaded", userId, { fileName: input.fileName });
  return { version };
}

async function versionRow(documentId: string, version: number) {
  const { data } = await db().from("offering_document_versions").select("*").eq("offering_document_id", documentId).eq("version", version).maybeSingle();
  if (!data) throw new Error("That version was not found.");
  return data;
}

export async function approveDocumentVersion(userId: string, input: { documentId: string; version: number }) {
  const d = await docRow(input.documentId);
  await assertStaff(userId, d.offering_id);
  const v = await versionRow(d.id, input.version);
  if (v.approval_status !== "uploaded_review_required") throw new Error("Only a version awaiting review can be approved.");
  await (await import("@/lib/legal-name-gate.server")).assertLegalName({ offeringId: d.offering_id }, "offering_document_approval");
  await db().from("offering_document_versions").update({ approval_status: "approved", approved_by: userId, approved_at: now() }).eq("id", v.id);
  await event(d.offering_id, d.id, v.version, "version_approved", userId);
  return { ok: true };
}

export async function setDocumentUsage(userId: string, input: { documentId: string; usage: DocumentUsage; applicability: Applicability }) {
  const d = await docRow(input.documentId);
  await assertStaff(userId, d.offering_id);
  await db()
    .from("offering_documents")
    .update({ usage: input.usage, applicability: input.applicability, requires_signature: input.usage === "signature" })
    .eq("id", d.id);
  await event(d.offering_id, d.id, null, "usage_changed", userId, { from: d.usage, to: input.usage, applicability: input.applicability });
  return { ok: true };
}

export async function saveSigningConfig(userId: string, input: { documentId: string; version: number; config: SigningConfig; confirm: boolean }) {
  const d = await docRow(input.documentId);
  await assertStaff(userId, d.offering_id);
  if (d.usage !== "signature") throw new Error("Set the document to Signature Required first.");
  const v = await versionRow(d.id, input.version);
  if (v.approval_status === "superseded") throw new Error("A superseded version can't be configured.");
  const { data: o } = await db().from("offerings").select("fund_signatory_person_id").eq("id", d.offering_id).maybeSingle();
  const errors = signingConfigErrors(input.config, { hasFundSignatory: !!o?.fund_signatory_person_id });
  if (errors.length) throw new Error(errors[0]);
  await db()
    .from("offering_document_versions")
    .update({
      signing_config: input.config,
      signing_config_status: input.confirm ? "confirmed" : "needs_review",
      signing_config_confirmed_by: input.confirm ? userId : null,
      signing_config_confirmed_at: input.confirm ? now() : null,
    })
    .eq("id", v.id);
  // Keep the existing Box flow reading a matching countersigner.
  if (input.confirm && input.config.signers.some((s) => s.role === "fund_signatory") && o?.fund_signatory_person_id) {
    const { data: p } = await db().from("persons").select("user_id").eq("id", o.fund_signatory_person_id).maybeSingle();
    if (p?.user_id && d.active_version === v.version) await db().from("offering_documents").update({ countersigner_user_id: p.user_id }).eq("id", d.id);
  }
  await event(d.offering_id, d.id, v.version, input.confirm ? "signing_setup_confirmed" : "signing_setup_changed", userId, { roles: input.config.signers.map((s) => s.role) });
  return { ok: true };
}

async function investmentsForDocument(offeringId: string, documentId: string) {
  const { data: rows } = await db().from("investor_onboardings").select("id, application_id, investment_profile_id, offering_class_key, removed_at").eq("offering_id", offeringId).is("removed_at", null);
  const list = (rows ?? []) as any[];
  const profileIds = list.map((r) => r.investment_profile_id).filter(Boolean);
  const { data: profiles } = profileIds.length ? await db().from("investment_profiles").select("id, profile_type").in("id", profileIds) : { data: [] };
  const typeOf = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p.profile_type]));
  const { data: sigs } = await db().from("document_signatures").select("id, application_id, investment_profile_id, signature_template_version, provider_completed_at, provider_sent_at, cancelled_at").eq("offering_document_id", documentId).is("cancelled_at", null);
  const sigIds = ((sigs ?? []) as any[]).map((s) => s.id);
  const { data: signers } = sigIds.length ? await db().from("document_signature_signers").select("signature_id, role_key, status, required").in("signature_id", sigIds) : { data: [] };
  return list.map((r) => {
    const sig = ((sigs ?? []) as any[]).find((s) => (r.application_id && s.application_id === r.application_id) || (r.investment_profile_id && s.investment_profile_id === r.investment_profile_id));
    const rows = sig ? ((signers ?? []) as any[]).filter((x) => x.signature_id === sig.id).map((x) => ({ role: x.role_key ?? "investor", status: x.status, required: x.required })) : [];
    const exec = toOfferingExecutionState(canonicalExecutionStatus({ signers: rows, providerCompleted: Boolean(sig?.provider_completed_at), providerSent: Boolean(sig?.provider_sent_at) }), rows.length > 0 || Boolean(sig?.provider_completed_at));
    return { onboardingId: r.id, executedVersion: sig?.signature_template_version ?? null, execution: exec as any, profileType: typeOf.get(r.investment_profile_id) ?? null, classKey: r.offering_class_key ?? null };
  });
}

export async function previewVersionImpact(userId: string, input: { documentId: string }) {
  const d = await docRow(input.documentId);
  await assertStaff(userId, d.offering_id);
  const inv = await investmentsForDocument(d.offering_id, d.id);
  return versionChangeImpact(inv, d.active_version);
}

/** Makes an approved, correctly configured version the one used for new Investments. */
export async function activateDocumentVersion(userId: string, input: { documentId: string; version: number; impactAcknowledged: boolean }) {
  const d = await docRow(input.documentId);
  await assertStaff(userId, d.offering_id);
  const v = await versionRow(d.id, input.version);
  if (v.approval_status !== "approved") throw new Error("Approve this version before activating it.");
  if (d.usage === "signature" && v.signing_config_status !== "confirmed") throw new Error("Confirm the signing setup for this version first.");
  if (d.active_version && d.active_version !== v.version && !input.impactAcknowledged) throw new Error("Review the investor impact before activating a new version.");
  if (d.active_version && d.active_version !== v.version) {
    // Earlier versions become history; executed Investments keep the version they signed.
    await db().from("offering_document_versions").update({ approval_status: "superseded", superseded_at: now() }).eq("offering_document_id", d.id).eq("version", d.active_version);
    await event(d.offering_id, d.id, d.active_version, "version_superseded", userId);
  }
  const countersign = (v.signing_config?.signers ?? []).some((s: any) => s.role === "fund_signatory");
  let countersigner: string | null = null;
  if (countersign) {
    const { data: o } = await db().from("offerings").select("fund_signatory_person_id").eq("id", d.offering_id).maybeSingle();
    const { data: p } = o?.fund_signatory_person_id ? await db().from("persons").select("user_id").eq("id", o.fund_signatory_person_id).maybeSingle() : { data: null };
    countersigner = p?.user_id ?? null;
  }
  await db()
    .from("offering_documents")
    .update({
      active_version: v.version,
      file_path: v.file_path,
      file_name: v.file_name,
      file_size_bytes: v.file_size_bytes,
      signature_template_version: v.version,
      signing_mode: countersign ? "countersign" : d.signing_mode,
      countersigner_user_id: countersign ? countersigner : d.countersigner_user_id,
    })
    .eq("id", d.id);
  await event(d.offering_id, d.id, v.version, "version_activated", userId);
  return { ok: true };
}

/** Documents that apply to the caller's own Investment, with a plain action label. */
export async function investorDocuments(userId: string, onboardingId: string) {
  const { data: row } = await db().from("investor_onboardings").select("id, offering_id, investor_user_id, investment_profile_id, application_id, offering_class_key").eq("id", onboardingId).maybeSingle();
  if (!row || row.investor_user_id !== userId) forbid("that investment isn't yours.");
  const { data: profile } = row.investment_profile_id ? await db().from("investment_profiles").select("profile_type").eq("id", row.investment_profile_id).maybeSingle() : { data: null };
  const { data: docs } = await db().from("offering_documents").select("id, title, usage, applicability, active_version, requires_signature").eq("offering_id", row.offering_id).not("active_version", "is", null);
  const applicable = ((docs ?? []) as any[]).filter((d) => documentApplies(d.applicability, { profileType: profile?.profile_type ?? null, classKey: row.offering_class_key ?? null }));
  const { data: acks } = await db().from("investment_document_acknowledgments").select("offering_document_id, version").eq("onboarding_id", row.id);
  const inv = await Promise.all(applicable.map(async (d) => (await investmentsForDocument(row.offering_id, d.id)).find((i) => i.onboardingId === row.id)));
  return applicable.map((d, i) => {
    const acknowledged = ((acks ?? []) as any[]).some((a) => a.offering_document_id === d.id && a.version === d.active_version);
    return {
      id: d.id,
      title: d.title,
      action: investorDocumentAction({ usage: d.usage, legacyRequiresSignature: d.requires_signature, acknowledged, execution: inv[i]?.execution ?? "not_sent" }),
    };
  });
}

export async function acknowledgeDocument(userId: string, input: { onboardingId: string; documentId: string }) {
  const { data: row } = await db().from("investor_onboardings").select("id, offering_id, investor_user_id, investment_profile_id, offering_class_key").eq("id", input.onboardingId).maybeSingle();
  if (!row || row.investor_user_id !== userId) forbid("that investment isn't yours.");
  const d = await docRow(input.documentId);
  if (d.offering_id !== row.offering_id) forbid("that document isn't part of this investment.");
  if (d.usage !== "acknowledgment" || !d.active_version) throw new Error("This document doesn't need an acknowledgment.");
  const { data: profile } = row.investment_profile_id ? await db().from("investment_profiles").select("profile_type").eq("id", row.investment_profile_id).maybeSingle() : { data: null };
  if (!documentApplies(d.applicability, { profileType: profile?.profile_type ?? null, classKey: row.offering_class_key ?? null })) forbid("that document doesn't apply to this investment.");
  await db().from("investment_document_acknowledgments").upsert(
    { onboarding_id: row.id, offering_document_id: d.id, version: d.active_version, acknowledged_by: userId },
    { onConflict: "onboarding_id,offering_document_id,version", ignoreDuplicates: true },
  );
  await event(d.offering_id, d.id, d.active_version, "acknowledged", userId, { onboardingId: row.id });
  try {
    const { reconcileInvestmentReadiness } = await import("@/lib/investor-onboarding.server");
    await reconcileInvestmentReadiness(row.id, { actorUserId: userId, trigger: "document_acknowledged" });
  } catch {
    // A failed readiness refresh never undoes the acknowledgment.
  }
  return { ok: true };
}
