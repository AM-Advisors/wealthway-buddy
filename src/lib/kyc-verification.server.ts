/**
 * Server-side KYC/AML orchestration.
 *
 * Didit performs the checks; Harmonious owns the record. Sessions are created
 * server-side and correlated by an opaque Harmonious verification reference
 * (never by email), results are always re-read from Didit's authoritative
 * session decision, and the Harmonious compliance decision is stored
 * separately from the provider's.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildDiditPrefill,
  compareNames,
  evaluateHarmoniousDecision,
  normalizeDiditDecision,
  sanitizeProviderPayload,
  type CheckStatus,
  type HarmoniousDecision,
  type NormalizedVerification,
} from "@/lib/kyc-verification";
import { applyProofPolicy, evaluateProofOfAddress } from "@/lib/address-validation";
import { refreshOnboardingState } from "@/lib/identity.server";

const db = () => supabaseAdmin as any;

const DIDIT_SESSION_URL = "https://verification.didit.me/v2/session/";
const DIDIT_DECISION_URL = "https://verification.didit.me/v2/session/";

/** Statuses where an existing session can still be resumed by the person. */
const RESUMABLE: ReadonlySet<string> = new Set(["not_started", "pending"]);

export interface VerificationRow {
  id: string;
  application_id: string;
  person_id: string | null;
  verification_ref: string;
  session_id: string | null;
  session_url: string | null;
  status: CheckStatus;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Provider calls (API key stays on the server)
// ---------------------------------------------------------------------------

function diditKey(): string | null {
  const key = process.env["DIDIT_API_KEY"];
  return key && key.trim() ? key.trim() : null;
}

export function diditWorkflowId(): string | null {
  const id = process.env["DIDIT_WORKFLOW_ID"];
  return id && id.trim() ? id.trim() : null;
}

/** Reads the authoritative session decision from Didit. */
export async function fetchSessionDecision(
  sessionId: string,
): Promise<Record<string, any> | null> {
  const key = diditKey();
  if (!key || !sessionId) return null;
  try {
    const res = await fetch(
      `${DIDIT_DECISION_URL}${encodeURIComponent(sessionId)}/decision/`,
      { headers: { "x-api-key": key, accept: "application/json" } },
    );
    if (!res.ok) {
      console.error("[kyc] decision fetch failed", sessionId, res.status);
      return null;
    }
    return (await res.json()) as Record<string, any>;
  } catch (e) {
    console.error("[kyc] decision fetch error", e instanceof Error ? e.message : String(e));
    return null;
  }
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export async function personForUser(userId: string): Promise<Record<string, any> | null> {
  const { data } = await db().from("persons").select("*").eq("user_id", userId).maybeSingle();
  return data ?? null;
}

/** The verification record for an application, created on first need. */
export async function ensureVerification(input: {
  applicationId: string;
  personId?: string | null;
}): Promise<VerificationRow> {
  const existing = await db()
    .from("kyc_verifications")
    .select("*")
    .eq("application_id", input.applicationId)
    .maybeSingle();

  if (existing.data) {
    if (input.personId && !existing.data.person_id) {
      await db()
        .from("kyc_verifications")
        .update({ person_id: input.personId })
        .eq("id", existing.data.id);
      existing.data.person_id = input.personId;
    }
    return existing.data as VerificationRow;
  }

  const created = await db()
    .from("kyc_verifications")
    .insert({
      application_id: input.applicationId,
      person_id: input.personId ?? null,
      provider: "didit",
      status: "not_started",
    })
    .select("*")
    .single();
  if (created.error) throw new Error(created.error.message);
  return created.data as VerificationRow;
}

/** The person's current residential address, if one has been captured. */
export async function currentAddress(personId: string | null | undefined) {
  if (!personId) return null;
  const { data } = await db()
    .from("person_addresses")
    .select("*")
    .eq("person_id", personId)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Is a compliance hold active for this person right now? */
export async function holdActiveForUser(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const { data } = await db()
    .from("compliance_holds")
    .select("id")
    .eq("status", "active")
    .eq("subject_user_id", userId)
    .in("scope", ["investor_onboarding", "account_activity", "service_delivery"])
    .limit(1);
  return ((data ?? []) as any[]).length > 0;
}

/** Harmonious policy: does this person need documented proof of residence? */
export async function proofOfAddressRequired(input: {
  personId: string | null;
  applicationId: string | null;
}): Promise<boolean> {
  if (!input.applicationId) return false;
  const { data: application } = await db()
    .from("investor_applications")
    .select("offering_id")
    .eq("id", input.applicationId)
    .maybeSingle();
  if (!application?.offering_id) return false;
  const { data: requirements } = await db()
    .from("offering_requirements")
    .select("*")
    .eq("offering_id", application.offering_id)
    .maybeSingle();
  const flag = (requirements ?? {})["requires_proof_of_address"];
  if (typeof flag === "boolean") return flag;
  // Not configured: a person resident outside the offering's home country is
  // the conservative case that needs documented proof.
  const address = await currentAddress(input.personId);
  return !!address && String(address.country ?? "").toUpperCase() !== "US";
}

// ---------------------------------------------------------------------------
// Session creation
// ---------------------------------------------------------------------------

export interface StartResult {
  url: string;
  resumed: boolean;
  verificationId: string;
}

/**
 * Creates (or resumes) the Didit session for a person's application, sending
 * only the information Harmonious already holds.
 */
export async function startVerificationSession(input: {
  applicationId: string;
  userId: string;
  origin: string;
}): Promise<StartResult> {
  const key = diditKey();
  const workflowId = diditWorkflowId();
  if (!key || !workflowId) {
    throw new Error(
      "Identity verification is not configured yet. Please contact the fund administrator.",
    );
  }

  const person = await personForUser(input.userId);
  const verification = await ensureVerification({
    applicationId: input.applicationId,
    personId: (person?.id as string) ?? null,
  });

  if (verification.session_url && RESUMABLE.has(String(verification.status))) {
    return { url: String(verification.session_url), resumed: true, verificationId: verification.id };
  }

  const prefill = buildDiditPrefill(person);

  const response = await fetch(DIDIT_SESSION_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify({
      workflow_id: workflowId,
      // Opaque Harmonious correlation id — never the email address.
      vendor_data: verification.verification_ref,
      metadata: { verification_ref: verification.verification_ref },
      callback: `${input.origin}/portal`,
      ...(Object.keys(prefill).length ? { contact_details: prefill, expected_details: prefill } : {}),
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error("[kyc] session create failed", response.status, text.slice(0, 500));
    throw new Error("Could not start identity verification. Please try again shortly.");
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Identity provider returned an unreadable response.");
  }

  const sessionId = payload["session_id"] ? String(payload["session_id"]) : null;
  const url = payload["url"] ?? payload["session_url"] ?? payload["verification_url"];
  if (!url) throw new Error("Identity provider did not return a verification link.");

  const now = new Date().toISOString();
  const { error } = await db()
    .from("kyc_verifications")
    .update({
      provider: "didit",
      session_id: sessionId,
      inquiry_id: sessionId,
      session_url: String(url),
      vendor_data: verification.verification_ref,
      workflow_id: workflowId,
      prefill_sent: Object.keys(prefill).reduce<Record<string, boolean>>((acc, field) => {
        acc[field] = true;
        return acc;
      }, {}),
      status: "pending",
      updated_at: now,
    })
    .eq("id", verification.id);
  if (error) throw new Error(error.message);

  await db()
    .from("investor_applications")
    .update({ kyc_status: "pending", updated_at: now })
    .eq("id", input.applicationId)
    .eq("kyc_status", "not_started");

  if (person?.id) {
    await db().from("person_onboarding_events").insert({
      person_id: person.id,
      from_state: person.onboarding_state ?? null,
      to_state: person.onboarding_state ?? "identity_required",
      actor_kind: "system",
      reason: "Identity verification session created",
      detail: { verification_ref: verification.verification_ref, workflow_id: workflowId },
    });
  }

  return { url: String(url), resumed: false, verificationId: verification.id };
}

// ---------------------------------------------------------------------------
// Synchronising provider results
// ---------------------------------------------------------------------------

/** Finds the verification a provider event belongs to. Email is never used. */
export async function resolveVerification(input: {
  vendorData?: string | null;
  sessionId?: string | null;
}): Promise<VerificationRow | null> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (input.vendorData && uuid.test(input.vendorData)) {
    const byRef = await db()
      .from("kyc_verifications")
      .select("*")
      .eq("verification_ref", input.vendorData)
      .maybeSingle();
    if (byRef.data) return byRef.data as VerificationRow;

    // Backwards compatibility: sessions created before the opaque reference
    // used the application id as vendor_data.
    const byApplication = await db()
      .from("kyc_verifications")
      .select("*")
      .eq("application_id", input.vendorData)
      .maybeSingle();
    if (byApplication.data) return byApplication.data as VerificationRow;
  }

  if (input.sessionId) {
    const bySession = await db()
      .from("kyc_verifications")
      .select("*")
      .or(`session_id.eq.${input.sessionId},inquiry_id.eq.${input.sessionId}`)
      .maybeSingle();
    if (bySession.data) return bySession.data as VerificationRow;
  }

  return null;
}

export interface SyncResult {
  applied: boolean;
  reason?: string;
  verificationId?: string;
  applicationId?: string;
  decision?: HarmoniousDecision;
  source?: "provider_api" | "webhook_payload";
}

/**
 * Re-reads the authoritative decision from Didit and applies it. A webhook
 * payload is only used when the provider API cannot be reached.
 */
export async function syncVerification(input: {
  verification: VerificationRow;
  sessionId?: string | null;
  fallbackPayload?: Record<string, any> | null;
  trigger: "webhook" | "reconciliation" | "manual";
  actorUserId?: string | null;
}): Promise<SyncResult> {
  const sessionId = input.sessionId ?? (input.verification.session_id as string | null);
  let decision: Record<string, any> | null = sessionId ? await fetchSessionDecision(sessionId) : null;
  let source: SyncResult["source"] = "provider_api";

  if (!decision) {
    const fallback = input.fallbackPayload?.["decision"] ?? input.fallbackPayload ?? null;
    if (!fallback || typeof fallback !== "object") {
      return { applied: false, reason: "no authoritative decision available" };
    }
    decision = fallback as Record<string, any>;
    source = "webhook_payload";
  }

  const applied = await applyDecision({
    verification: input.verification,
    decision,
    trigger: input.trigger,
    source,
    actorUserId: input.actorUserId ?? null,
  });
  return { ...applied, source };
}

interface ApplyInput {
  verification: VerificationRow;
  decision: Record<string, any>;
  trigger: "webhook" | "reconciliation" | "manual";
  source: "provider_api" | "webhook_payload";
  actorUserId: string | null;
}

async function applyDecision(input: ApplyInput): Promise<SyncResult> {
  const verification = input.verification;
  const normalized: NormalizedVerification = normalizeDiditDecision(input.decision);
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: application } = await db()
    .from("investor_applications")
    .select("id, user_id, offering_id, kyc_status, aml_status")
    .eq("id", verification.application_id)
    .maybeSingle();

  const personId =
    (verification.person_id as string | null) ??
    ((await db().from("persons").select("id").eq("user_id", application?.user_id).maybeSingle())
      .data?.id as string | null) ??
    null;
  const { data: person } = personId
    ? await db().from("persons").select("*").eq("id", personId).maybeSingle()
    : { data: null };

  const legalName = person
    ? [person.legal_first_name, person.legal_middle_name, person.legal_last_name]
        .filter(Boolean)
        .join(" ")
    : null;

  const address = await currentAddress(personId);
  const poaRequired = await proofOfAddressRequired({
    personId,
    applicationId: verification.application_id,
  });
  const holdActive = await holdActiveForUser(application?.user_id ?? null);

  const decision = evaluateHarmoniousDecision({
    normalized,
    verificationDate: now,
    proofOfAddressRequired: poaRequired,
    addressOnFile: address
      ? {
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          region: address.region,
          postalCode: address.postal_code,
          country: address.country,
        }
      : null,
    legalName,
    holdActive,
  });

  // 1. The verification record: provider facts and the Harmonious decision,
  //    kept apart, with provider media URLs and document numbers stripped.
  const safePayload = sanitizeProviderPayload(input.decision) as Record<string, unknown>;
  const update: Record<string, any> = {
    provider: "didit",
    person_id: personId,
    session_id: normalized.sessionId ?? verification.session_id,
    status: decision.kyc,
    decision: safePayload,
    result: safePayload,
    document_type: normalized.document.documentType,
    document_issuing_country: normalized.document.issuingCountry,
    document_issuing_region: normalized.document.issuingRegion,
    document_issue_date: normalized.document.issueDate,
    document_expiration_date: normalized.document.expirationDate,
    document_number_last4: normalized.document.numberLast4,
    document_expired: decision.documentExpired,
    verified_full_name: normalized.document.verifiedName,
    verified_date_of_birth: normalized.document.dateOfBirth,
    liveness_status: normalized.liveness.status,
    face_match_status: normalized.faceMatch.status,
    face_match_score: normalized.faceMatch.score,
    address_check_status:
      decision.checks.find((c) => c.kind === "address")?.harmoniousStatus ?? "not_started",
    proof_of_address_status:
      decision.checks.find((c) => c.kind === "proof_of_address")?.harmoniousStatus ?? "not_started",
    provider_decision: normalized.providerDecision,
    provider_warnings: normalized.warnings,
    harmonious_decision: decision.kyc,
    harmonious_decision_reason: decision.reasons.join(" ") || null,
    verification_completed_on: nowIso.slice(0, 10),
    last_synced_at: nowIso,
    updated_at: nowIso,
    completed_at: decision.kyc === "approved" || decision.kyc === "declined" ? nowIso : null,
  };
  if (input.trigger === "reconciliation") update["reconciled_at"] = nowIso;

  const { error: updateError } = await db()
    .from("kyc_verifications")
    .update(update)
    .eq("id", verification.id);
  if (updateError) throw new Error(updateError.message);

  // 2. Every underlying check keeps its own row.
  for (const check of decision.checks) {
    await db()
      .from("identity_check_results")
      .upsert(
        {
          verification_id: verification.id,
          person_id: personId,
          check_kind: check.kind,
          provider: "didit",
          provider_status: check.providerStatus,
          harmonious_status: check.harmoniousStatus,
          detail: check.detail,
          warnings: check.warnings,
          evaluated_at: nowIso,
        },
        { onConflict: "verification_id,check_kind" },
      );
  }

  // 3. AML stays a record of its own.
  const amlCheck = decision.checks.find((c) => c.kind === "aml");
  if (amlCheck && amlCheck.harmoniousStatus !== "not_started") {
    const { data: existingAml } = await db()
      .from("aml_screenings")
      .select("id")
      .eq("application_id", verification.application_id)
      .maybeSingle();
    const payload = {
      application_id: verification.application_id,
      provider: "didit",
      report_id: normalized.sessionId ?? verification.session_id,
      status: decision.aml,
      matches: sanitizeProviderPayload(
        (input.decision as any)?.aml?.hits ?? (input.decision as any)?.aml_screenings ?? [],
      ),
      completed_at: decision.aml === "approved" || decision.aml === "declined" ? nowIso : null,
      updated_at: nowIso,
    };
    if (existingAml?.id) await db().from("aml_screenings").update(payload).eq("id", existingAml.id);
    else await db().from("aml_screenings").insert(payload);
  }

  // 4. Address evidence.
  if (address) {
    await applyAddressEvidence({
      address,
      personId,
      verificationId: verification.id,
      normalized,
      legalName,
      poaRequired,
    });
  }

  // 5. Application and person records.
  await db()
    .from("investor_applications")
    .update({
      kyc_status: decision.kyc,
      ...(amlCheck && amlCheck.harmoniousStatus !== "not_started" ? { aml_status: decision.aml } : {}),
      updated_at: nowIso,
    })
    .eq("id", verification.application_id);

  if (personId) {
    await db()
      .from("persons")
      .update({
        kyc_status: decision.kyc,
        ...(amlCheck && amlCheck.harmoniousStatus !== "not_started" ? { aml_status: decision.aml } : {}),
        kyc_verified_at: decision.kyc === "approved" ? nowIso : null,
        identity_verified_at: decision.kyc === "approved" ? nowIso : null,
        aml_screened_at: decision.aml === "approved" ? nowIso : null,
        updated_at: nowIso,
      })
      .eq("id", personId);

    await db().from("person_onboarding_events").insert({
      person_id: personId,
      from_state: person?.onboarding_state ?? null,
      to_state: person?.onboarding_state ?? "kyc_pending",
      actor_kind: input.trigger === "manual" ? "staff" : "provider",
      actor_user_id: input.actorUserId,
      reason: `Didit ${normalized.providerDecision ?? "result"} synchronised (${input.source})`,
      detail: {
        provider_decision: normalized.providerDecision,
        harmonious_kyc: decision.kyc,
        harmonious_aml: decision.aml,
        document_expired: decision.documentExpired,
        reasons: decision.reasons,
        trigger: input.trigger,
      },
    });

    await refreshOnboardingState(personId);
  }

  // 6. A review requirement becomes an exception a human can work.
  if (decision.reviewRequired) {
    await raiseReviewException({
      userId: application?.user_id ?? null,
      applicationId: verification.application_id,
      reasons: decision.reasons.length ? decision.reasons : ["Provider flagged the verification."],
      expired: decision.documentExpired,
    });
  }

  return {
    applied: true,
    verificationId: verification.id,
    applicationId: verification.application_id,
    decision,
  };
}

async function applyAddressEvidence(input: {
  address: any;
  personId: string | null;
  verificationId: string;
  normalized: NormalizedVerification;
  legalName: string | null;
  poaRequired: boolean;
}) {
  const poa = input.normalized.proofOfAddress;
  const current = String(input.address.state) as any;

  const evaluation = poa.status === "not_started" && !input.poaRequired
    ? null
    : evaluateProofOfAddress({
        current,
        onFile: {
          line1: input.address.line1,
          line2: input.address.line2,
          city: input.address.city,
          region: input.address.region,
          postalCode: input.address.postal_code,
          country: input.address.country,
        },
        extracted: poa.extracted
          ? {
              line1: poa.extracted.line1,
              city: poa.extracted.city,
              region: poa.extracted.region,
              postalCode: poa.extracted.postalCode,
              country: poa.extracted.country,
            }
          : null,
        nameMatch: compareNames(input.legalName, poa.name),
        providerStatus: poa.status,
      });

  const target = evaluation ? evaluation.state : applyProofPolicy(current, input.poaRequired);
  if (target === current && !evaluation) return;

  const nowIso = new Date().toISOString();
  await db()
    .from("person_addresses")
    .update({
      state: target,
      state_reason: evaluation?.reason ?? "Proof of residence required by policy.",
      provider_extracted_address: poa.extracted ?? null,
      match_result: evaluation
        ? { address: evaluation.addressMatch, name: evaluation.nameMatch }
        : {},
      proof_document_type: poa.documentType,
      proof_issue_date: poa.issueDate,
      proof_provider_status: poa.status,
      proof_warnings: poa.warnings,
      proof_verified_at: target === "proof_verified" ? nowIso : null,
      verification_id: input.verificationId,
      updated_at: nowIso,
    })
    .eq("id", input.address.id);

  await db().from("address_verification_events").insert({
    address_id: input.address.id,
    person_id: input.personId,
    from_state: current,
    to_state: target,
    source: "didit",
    detail: {
      provider_status: poa.status,
      document_type: poa.documentType,
      issue_date: poa.issueDate,
      warnings: poa.warnings,
      match: evaluation ? { address: evaluation.addressMatch, name: evaluation.nameMatch } : null,
    },
  });
}

async function raiseReviewException(input: {
  userId: string | null;
  applicationId: string;
  reasons: string[];
  expired: boolean;
}) {
  if (!input.userId) return;
  const { data: onboarding } = await db()
    .from("investor_onboardings")
    .select("id")
    .eq("investor_user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!onboarding?.id) return;

  const type = input.expired ? "identity_document_expired" : "identity_verification_review";
  const { data: existing } = await db()
    .from("investor_onboarding_exceptions")
    .select("id")
    .eq("onboarding_id", onboarding.id)
    .eq("exception_type", type)
    .eq("status", "open")
    .maybeSingle();
  if (existing?.id) return; // idempotent: one open exception per finding

  await db().from("investor_onboarding_exceptions").insert({
    onboarding_id: onboarding.id,
    exception_type: type,
    severity: input.expired ? "high" : "normal",
    owner: "compliance",
    status: "open",
    detail: input.reasons.join(" "),
  });
}

// ---------------------------------------------------------------------------
// Reconciliation (webhooks are not the only recovery path)
// ---------------------------------------------------------------------------

export interface ReconcileResult {
  checked: number;
  synchronised: number;
  details: { verificationId: string; applied: boolean; reason?: string }[];
}

/**
 * Re-reads outstanding sessions from Didit. Never creates a new session: a
 * missed webhook is a synchronisation problem, not a new verification.
 */
export async function reconcileOutstandingVerifications(options: {
  olderThanMinutes?: number;
  limit?: number;
  verificationId?: string | null;
  actorUserId?: string | null;
} = {}): Promise<ReconcileResult> {
  const cutoff = new Date(Date.now() - (options.olderThanMinutes ?? 10) * 60_000).toISOString();

  let query = db()
    .from("kyc_verifications")
    .select("*")
    .not("session_id", "is", null)
    .limit(options.limit ?? 25);

  if (options.verificationId) {
    query = query.eq("id", options.verificationId);
  } else {
    query = query.in("status", ["pending", "not_started", "review"]).lt("updated_at", cutoff);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as VerificationRow[];
  const details: ReconcileResult["details"] = [];
  let synchronised = 0;

  for (const row of rows) {
    const result = await syncVerification({
      verification: row,
      sessionId: row.session_id,
      trigger: options.verificationId ? "manual" : "reconciliation",
      actorUserId: options.actorUserId ?? null,
    });
    if (result.applied) synchronised += 1;
    details.push({
      verificationId: row.id,
      applied: result.applied,
      ...(result.reason ? { reason: result.reason } : {}),
    });
  }

  return { checked: rows.length, synchronised, details };
}
