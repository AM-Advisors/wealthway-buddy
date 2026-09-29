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
  appliedVersionFor,
  resignTargets,
  rolloutCounts,
  type RolloutScope,
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
      rolloutScope: (v.rollout_scope ?? null) as RolloutScope | null,
      targetOnboardingId: (v.target_onboarding_id ?? null) as string | null,
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
  const [{ data: resign }, { data: requests }] = await Promise.all([
    db().from("offering_document_resign_items").select("id, offering_document_id, onboarding_id, from_version, to_version, status").eq("offering_id", offeringId).eq("status", "open"),
    db().from("offering_document_change_requests").select("id, offering_document_id, file_name, rollout_scope, note, status, requested_by, requested_at, decision_note").eq("offering_id", offeringId).order("requested_at", { ascending: false }).limit(50),
  ]);
  const withUsage = await Promise.all(
    list.map(async (d) => {
      const inv = d.activeVersion != null || d.versions.length ? await investmentsForDocument(offeringId, d.id) : [];
      const signedByVersion: Record<number, number> = {};
      for (const i of inv) if (i.execution === "fully_executed" && i.executedVersion != null) signedByVersion[i.executedVersion] = (signedByVersion[i.executedVersion] ?? 0) + 1;
      return {
        ...d,
        usageCounts: {
          signedByVersion,
          waiting: inv.filter((i) => ["sent", "partially_signed", "awaiting_countersignature"].includes(i.execution)).length,
          notSent: inv.filter((i) => i.execution === "not_sent").length,
          individual: d.versions.filter((v) => v.rolloutScope === "single").length,
        },
        resignOpen: ((resign ?? []) as any[]).filter((r) => r.offering_document_id === d.id).map((r) => ({ id: r.id as string, onboardingId: r.onboarding_id as string, from: r.from_version as number | null, to: r.to_version as number })),
        changeRequests: ((requests ?? []) as any[]).filter((r) => r.offering_document_id === d.id).map((r) => ({
          id: r.id as string, fileName: r.file_name as string, scope: r.rollout_scope as RolloutScope, note: r.note as string | null, status: r.status as string,
          requestedAt: r.requested_at as string, decisionNote: r.decision_note as string | null, mine: r.requested_by === userId,
        })),
      };
    }),
  );
  return { canEdit: actor.isStaff, documents: withUsage, status, hasFundSignatory: !!o?.fund_signatory_person_id, hasMultipleClasses: !!o?.has_multiple_classes };
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

/**
 * Puts an approved, correctly configured version into use.
 * - new_only: becomes the Fund template; anyone already sent or signed keeps their version.
 * - all: becomes the template and everyone already sent/signed gets an open re-sign item.
 * - single: used for one investor only; the Fund template is unchanged.
 * Nothing is sent automatically, and signed documents never change.
 */
export async function activateDocumentVersion(
  userId: string,
  input: { documentId: string; version: number; scope?: RolloutScope | undefined; targetOnboardingId?: string | null | undefined; note?: string | null | undefined; impactAcknowledged?: boolean | undefined },
) {
  const d = await docRow(input.documentId);
  await assertStaff(userId, d.offering_id);
  const v = await versionRow(d.id, input.version);
  if (v.approval_status !== "approved") throw new Error("Approve this version before activating it.");
  if (d.usage === "signature" && v.signing_config_status !== "confirmed") throw new Error("Confirm the signing setup for this version first.");
  const replacing = !!d.active_version && d.active_version !== v.version;
  const scope: RolloutScope = input.scope ?? (replacing ? (input.impactAcknowledged ? "new_only" : (null as any)) : "new_only");
  if (!scope) throw new Error("Choose who should get the new version.");
  const rollout = { rollout_scope: scope, rollout_note: input.note || null, rolled_out_by: userId, rolled_out_at: now() };

  if (scope === "single") {
    if (!input.targetOnboardingId) throw new Error("Choose the investor this version is for.");
    const { data: t } = await db().from("investor_onboardings").select("id, offering_id").eq("id", input.targetOnboardingId).maybeSingle();
    if (!t || t.offering_id !== d.offering_id) throw new Error("That investor isn't part of this Fund.");
    await db().from("offering_document_versions").update({ ...rollout, target_onboarding_id: t.id }).eq("id", v.id);
    await event(d.offering_id, d.id, v.version, "version_assigned_individual", userId, { onboardingId: t.id });
    await reconcile([t.id], userId);
    return { ok: true, resign: 0 };
  }

  const previous = d.active_version as number | null;
  let resignIds: string[] = [];
  if (replacing) {
    if (scope === "all") resignIds = resignTargets(await investmentsForDocument(d.offering_id, d.id), previous);
    // Earlier versions become history; executed Investments keep the version they signed.
    await db().from("offering_document_versions").update({ approval_status: "superseded", superseded_at: now() }).eq("offering_document_id", d.id).eq("version", previous);
    await event(d.offering_id, d.id, previous, "version_superseded", userId);
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
  await db().from("offering_document_versions").update({ ...rollout, target_onboarding_id: null }).eq("id", v.id);
  if (resignIds.length) {
    await db().from("offering_document_resign_items").upsert(
      resignIds.map((id) => ({ offering_id: d.offering_id, offering_document_id: d.id, onboarding_id: id, from_version: previous, to_version: v.version, created_by: userId })),
      { onConflict: "offering_document_id,onboarding_id,to_version", ignoreDuplicates: true },
    );
  }
  await event(d.offering_id, d.id, v.version, "version_activated", userId, { scope, resign: resignIds.length });
  await reconcile(resignIds, userId);
  return { ok: true, resign: resignIds.length };
}

async function reconcile(onboardingIds: string[], userId: string) {
  if (!onboardingIds.length) return;
  try {
    const { reconcileInvestmentReadiness } = await import("@/lib/investor-onboarding.server");
    for (const id of onboardingIds) await reconcileInvestmentReadiness(id, { actorUserId: userId, trigger: "document_version_rollout" } as any).catch(() => null);
  } catch {
    // Readiness refresh never undoes the rollout.
  }
}

/** Counts per choice for the Replace dialog, plus the investors to pick from for "Only one investor". */
export async function rolloutPreview(userId: string, input: { documentId: string }) {
  const d = await docRow(input.documentId);
  await assertStaff(userId, d.offering_id);
  const inv = await investmentsForDocument(d.offering_id, d.id);
  const { data: rows } = await db().from("investor_onboardings").select("id, investment_profile_id").eq("offering_id", d.offering_id).is("removed_at", null);
  const pids = ((rows ?? []) as any[]).map((r) => r.investment_profile_id).filter(Boolean);
  const { data: profiles } = pids.length ? await db().from("investment_profiles").select("id, display_name, legal_name").in("id", pids) : { data: [] };
  const nameOf = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p.display_name || p.legal_name || "Investor"]));
  return {
    counts: rolloutCounts(inv, d.active_version),
    hasActive: !!d.active_version,
    investors: ((rows ?? []) as any[]).map((r) => ({ onboardingId: r.id as string, name: (nameOf.get(r.investment_profile_id) as string) ?? "Investor (no profile yet)" })),
  };
}

export async function resolveResignItem(userId: string, input: { id: string; status: "sent" | "signed" | "waived" }) {
  const { data: item } = await db().from("offering_document_resign_items").select("*").eq("id", input.id).maybeSingle();
  if (!item) throw new Error("That re-sign item was not found.");
  await assertStaff(userId, item.offering_id);
  await db().from("offering_document_resign_items").update({ status: input.status, resolved_by: userId, resolved_at: now() }).eq("id", item.id);
  await event(item.offering_id, item.offering_document_id, item.to_version, `resign_${input.status}`, userId, { onboardingId: item.onboarding_id });
  await reconcile([item.onboarding_id], userId);
  return { ok: true };
}

// ------------------------------------------------------------------ manager change requests

export async function requestDocumentChange(
  userId: string,
  input: { documentId: string; filePath: string; fileName: string; fileSizeBytes: number; scope: RolloutScope; targetOnboardingId?: string | null | undefined; note?: string | null | undefined },
) {
  const d = await docRow(input.documentId);
  await assertRead(userId, d.offering_id);
  if (!input.filePath.startsWith(`${d.offering_id}/`)) throw new Error("That file does not belong to this fund.");
  if (input.scope === "single" && !input.targetOnboardingId) throw new Error("Choose the investor this version is for.");
  const { error } = await db().from("offering_document_change_requests").insert({
    offering_id: d.offering_id, offering_document_id: d.id, file_path: input.filePath, file_name: input.fileName, file_size_bytes: input.fileSizeBytes,
    rollout_scope: input.scope, target_onboarding_id: input.targetOnboardingId || null, note: input.note || null, requested_by: userId,
  });
  if (error) throw new Error(error.message);
  await event(d.offering_id, d.id, null, "change_requested", userId, { scope: input.scope });
  return { ok: true };
}

/** Accepting turns the proposed file into a new version awaiting review; it is never activated here. */
export async function decideChangeRequest(userId: string, input: { id: string; decision: "accept" | "decline"; note?: string | null | undefined }) {
  const { data: r } = await db().from("offering_document_change_requests").select("*").eq("id", input.id).maybeSingle();
  if (!r) throw new Error("That request was not found.");
  await assertStaff(userId, r.offering_id);
  if (r.status !== "pending") throw new Error("That request was already decided.");
  if (r.requested_by === userId) throw new Error("A different Harmonious team member must decide this request.");
  if (input.decision === "decline" && !input.note?.trim()) throw new Error("Give a reason for declining.");
  let createdVersion: number | null = null;
  if (input.decision === "accept") {
    // Copy into the fund's setup path so the version passes the same file checks.
    createdVersion = (await uploadDocumentVersion(userId, { documentId: r.offering_document_id, filePath: r.file_path, fileName: r.file_name, fileSizeBytes: Number(r.file_size_bytes) })).version;
    await db().from("offering_document_versions").update({ rollout_scope: r.rollout_scope, target_onboarding_id: r.target_onboarding_id, rollout_note: r.note }).eq("offering_document_id", r.offering_document_id).eq("version", createdVersion);
  }
  await db().from("offering_document_change_requests").update({ status: input.decision === "accept" ? "accepted" : "declined", decided_by: userId, decided_at: now(), decision_note: input.note || null, created_version: createdVersion }).eq("id", r.id);
  await event(r.offering_id, r.offering_document_id, createdVersion, `change_request_${input.decision}ed`, userId);
  return { ok: true, version: createdVersion };
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
  const ids = applicable.map((d) => d.id);
  const [{ data: singles }, { data: resign }] = await Promise.all([
    ids.length ? db().from("offering_document_versions").select("offering_document_id, version, target_onboarding_id").in("offering_document_id", ids).eq("rollout_scope", "single").eq("target_onboarding_id", row.id) : { data: [] },
    ids.length ? db().from("offering_document_resign_items").select("offering_document_id, from_version, to_version").eq("onboarding_id", row.id).eq("status", "open") : { data: [] },
  ]);
  return applicable.map((d, i) => {
    const applied = appliedVersionFor(row.id, d.active_version, ((singles ?? []) as any[]).filter((x) => x.offering_document_id === d.id).map((x) => ({ targetOnboardingId: x.target_onboarding_id, version: x.version })));
    const rs = ((resign ?? []) as any[]).find((x) => x.offering_document_id === d.id);
    const versionLabel = rs ? `Re-sign needed: v${rs.from_version ?? "?"} → v${rs.to_version}` : applied.reason === "individual" ? `Individual version v${applied.version}` : applied.version != null ? `Fund template v${applied.version}` : null;
    const acknowledged = ((acks ?? []) as any[]).some((a) => a.offering_document_id === d.id && a.version === d.active_version);
    return {
      id: d.id,
      title: d.title,
      action: investorDocumentAction({ usage: d.usage, legacyRequiresSignature: d.requires_signature, acknowledged, execution: inv[i]?.execution ?? "not_sent" }),
      versionLabel,
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
