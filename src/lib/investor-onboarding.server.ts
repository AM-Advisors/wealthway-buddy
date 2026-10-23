import { managerComplianceLabel, managerTaxLabel } from "@/lib/onboarding-compliance-model";
import { managerFundingLabel } from "@/lib/fund-onboarding-model";
import { profileDocumentRequirements, reusableProfileAccreditation } from "./profile-document-requirements";
import { selectProfileDocumentEvidence } from "./profile-document-evidence.server";
/**
 * Fund Administration Phase B - server-only investor onboarding engine.
 *
 * This is an ORCHESTRATION layer. It owns no compliance truth of its own: it
 * reads the authoritative records already in the platform -
 *
 *   persons                          identity, KYC, AML
 *   investment_profiles              who is investing (individual / LLC / trust / ...)
 *   investment_profile_relationships owners, control persons, trustees, signers
 *   entity_verifications             KYB and entity screening
 *   accreditation_records            accreditation and its verification method
 *   investor_tax_profiles            W-9 / W-8 status and expiry
 *   offerings, offering_requirements,
 *   fund_setups, fund_eligibility_configs, fund_banking_setups
 *   offering_documents, document_signatures
 *   bank_transactions, bank_reconciliations
 *   investor_positions, commitment_events
 *
 * Authority is always re-resolved here from user_roles and fund_managers.
 * Nothing trusts a role, fund id, profile id or amount supplied by a browser.
 */
import {
  applyExemption,
  invitationRecipientError,
  isAuthoritativeSignature,
  investorHomeSummary,
  journeySteps,
  managerInvestorStatus,
  nextJourneyStep,
  verificationSummary,
} from "@/lib/investor-journey-model";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  amountError,
  canCloseInvestment,
  canInvestorFund,
  signingRequirementSatisfied,
  verificationAllowsSigning,
  deriveFundingStatus,
  determineOnboardingRequirements,
  invitationStatusForStage,
  invitationUsableError,
  isExceptionType,
  managerSafeView,
  matchBankActivity,
  outstandingRequirements,
  progressChecklist,
  queueBucket,
  signatureAttribution,
  stageTransitionError,
  validateQuestionnaire,
  type ExceptionType,
  type FundingStatus,
  type OfferingRequirements,
  type OnboardingStage,
  type Question,
  type RequirementResult,
} from "@/lib/investor-onboarding-model";
import {
  ENTITY_PROFILE_TYPES,
  GATING_RELATIONSHIP_ROLES,
  isInvestmentProfileType,
  type InvestmentProfileType,
} from "@/lib/identity-model";
import { isReconciledFunding } from "@/lib/funding-status";

import standardQuestions from "@/lib/standard-investor-questionnaire.json";
const STANDARD_QUESTIONNAIRE = { version: 1, status: "published", standard: true, questions: standardQuestions as Question[] };
const db = () => supabaseAdmin as any;
const nowIso = () => new Date().toISOString();

export function forbid(message: string): never {
  throw new Error(`Forbidden: ${message}`);
}
function fail(message: string): never {
  throw new Error(message);
}

// ------------------------------------------------------------------ actor

export type OnboardingActor = {
  userId: string;
  isStaff: boolean;
  managedOfferingIds: string[];
};

export async function onboardingActor(userId: string | null | undefined): Promise<OnboardingActor> {
  if (!userId) forbid("you are not signed in.");
  const [{ data: roles }, { data: assignments }] = await Promise.all([
    db().from("user_roles").select("role").eq("user_id", userId),
    db().from("fund_managers").select("offering_id").eq("user_id", userId),
  ]);
  const list = ((roles ?? []) as { role: string }[]).map((r) => String(r.role));
  return {
    userId: String(userId),
    isStaff: list.includes("admin"),
    managedOfferingIds: [
      ...new Set(((assignments ?? []) as { offering_id: string }[]).map((a) => a.offering_id)),
    ],
  };
}

export async function assertStaff(userId: string): Promise<OnboardingActor> {
  const actor = await onboardingActor(userId);
  if (!actor.isStaff) forbid("Harmonious investor operations authority is required.");
  return actor;
}

async function onboardingRow(onboardingId: string) {
  const { data } = await db()
    .from("investor_onboardings")
    .select("*")
    .eq("id", onboardingId)
    .maybeSingle();
  if (!data) fail("That investment was not found.");
  return data;
}

export type Access = { actor: OnboardingActor; row: any; role: "staff" | "investor" | "manager" };

/** Resolve actor → relationship → fund → investor → record, for every call. */
export async function assertOnboardingAccess(userId: string, onboardingId: string): Promise<Access> {
  const actor = await onboardingActor(userId);
  const row = await onboardingRow(onboardingId);
  if (actor.isStaff) return { actor, row, role: "staff" };
  if (row.investor_user_id === actor.userId) return { actor, row, role: "investor" };
  if (actor.managedOfferingIds.includes(row.offering_id)) return { actor, row, role: "manager" };
  forbid("this investment is not yours.");
}

async function assertInvestorOwns(userId: string, onboardingId: string) {
  const access = await assertOnboardingAccess(userId, onboardingId);
  // Staff access takes precedence in read views, but does not erase ownership
  // when that same person completes their own investment as an investor.
  if (access.row.investor_user_id !== access.actor.userId) forbid("only the investor can complete their own onboarding.");
  if (["closed", "declined", "cancelled"].includes(String(access.row.stage))) {
    fail("This investment can no longer be changed.");
  }
  return { ...access, role: "investor" as const };
}

async function recordEvent(input: {
  onboardingId: string | null;
  offeringId?: string | null;
  event: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  subjectTable?: string | null;
  subjectId?: string | null;
  detail?: Record<string, unknown>;
  actorUserId: string;
  actorRole?: string;
}) {
  const SLACK_EVENTS: Record<string, string> = { questionnaire_submitted: "Investor submitted the questionnaire", signature_completed: "Investor signed subscription documents", investor_reports_funds_sent: "Investor reported a wire sent", amount_requested: "Investor submitted an investment amount", verification_completed: "Investor identity check finished" };
  if (SLACK_EVENTS[input.event]) {
    void (async () => (await import("@/lib/ops-slack-notify.server")).notifySubmission({ kind: `investor_${input.event}`, title: SLACK_EVENTS[input.event]!, offeringId: input.offeringId ?? null, submittedBy: input.actorUserId, ref: input.onboardingId, path: input.offeringId ? `/ops/fund-setup/${input.offeringId}` : null, completed: ["questionnaire_submitted", "signature_completed", "tax_form_uploaded", "w9_uploaded"].includes(input.event) }))().catch(() => null);
  }
  await db().from("investor_onboarding_events").insert({
    onboarding_id: input.onboardingId,
    offering_id: input.offeringId ?? null,
    event: input.event,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    subject_table: input.subjectTable ?? null,
    subject_id: input.subjectId ?? null,
    detail: input.detail ?? {},
    actor_user_id: input.actorUserId,
    actor_role: input.actorRole ?? null,
  });
}

async function touch(onboardingId: string, patch: Record<string, unknown>) {
  const { error } = await db()
    .from("investor_onboardings")
    .update({ ...patch, last_activity_at: nowIso() })
    .eq("id", onboardingId);
  if (error) fail(error.message);
}

// ------------------------------------------------------------ the offering

/** A fund may only take investors once Phase A has launched it. */
export async function launchedOffering(offeringIdOrSlug: string) {
  const byId = await db()
    .from("offerings")
    .select("*")
    .or(`id.eq.${offeringIdOrSlug},slug.eq.${offeringIdOrSlug}`)
    .maybeSingle();
  const offering = byId.data;
  if (!offering) fail("That fund was not found.");
  const { data: setup } = await db()
    .from("fund_setups")
    .select("*")
    .eq("offering_id", offering.id)
    .maybeSingle();
  if (!setup || (setup.launch_state !== "ready" && !setup.launched_at)) {
    fail("This fund is not open for investor onboarding yet.");
  }
  return { offering, setup };
}

// Short-lived cache: fund requirements rarely change, and readiness views re-read them per investor.
const REQ_CACHE = new Map<string, { at: number; v: OfferingRequirements }>();
const REQ_TTL = 60_000;

export async function offeringRequirements(offeringId: string): Promise<OfferingRequirements> {
  const hit = REQ_CACHE.get(offeringId);
  if (hit && Date.now() - hit.at < REQ_TTL) return hit.v;
  const v = await loadOfferingRequirements(offeringId);
  REQ_CACHE.set(offeringId, { at: Date.now(), v });
  return v;
}

async function loadOfferingRequirements(offeringId: string): Promise<OfferingRequirements> {
  const [{ data: offering }, { data: req }, { data: setup }] = await Promise.all([
    db().from("offerings").select("*").eq("id", offeringId).maybeSingle(),
    db().from("offering_requirements").select("*").eq("offering_id", offeringId).maybeSingle(),
    db().from("fund_setups").select("*").eq("offering_id", offeringId).maybeSingle(),
  ]);
  let rules: Record<string, any> = {};
  if (setup?.id) {
    const { data: configs } = await db()
      .from("fund_eligibility_configs")
      .select("*")
      .eq("setup_id", setup.id)
      .eq("status", "approved")
      .order("version", { ascending: false })
      .limit(1);
    rules = ((configs ?? [])[0]?.rules ?? {}) as Record<string, any>;
  }
  return requirementsFrom(offering, req, setup, rules);
}

/** Pure: offering requirements from already-read rows. Shared by single and batch readiness. */
function requirementsFrom(offering: any, req: any, setup: any, rules: Record<string, any>): OfferingRequirements {
  return applyExemption({
    accreditationRequired: Boolean(req?.accreditation_required ?? rules['accreditationRequired'] ?? false),
    accreditationMethod: (req?.accreditation_verification ?? rules['accreditationMethod'] ?? null) as string | null,
    qualifiedPurchaserRequired: Boolean(rules['qualifiedPurchaserRequired'] ?? false),
    kycRequired: Boolean(req?.requires_person_kyc ?? true),
    kybRequired: Boolean(req?.requires_entity_kyb ?? true),
    amlRequired: Boolean(req?.requires_person_aml ?? true),
    taxDocumentRequired: Boolean(rules['taxDocumentRequired'] ?? true),
    // Platform rule: every investor on every fund completes the investor questionnaire.
    subscriptionQuestionnaireRequired: true,
    minInvestmentCents: Number(setup?.min_investment_cents ?? offering?.min_investment_cents ?? 0) || null,
    maxInvestmentCents: (rules['maxInvestmentCents'] as number | undefined) ?? null,
    remainingCapacityCents: null,
    permittedJurisdictions: (rules['permittedJurisdictions'] as string[] | undefined) ?? null,
    permittedProfileTypes: (rules['permittedProfileTypes'] as string[] | undefined) ?? null,
    foreignInvestorsPermitted: rules['foreignInvestorsPermitted'] !== false,
  }, (offering as any)?.reg_type ?? null);
}

// Short-lived cache: a fund's document list is the same for every investor on it.
const DOCS_CACHE = new Map<string, { at: number; v: any[] }>();
const DOCS_TTL = 60_000;

async function offeringDocsCached(offeringId: string): Promise<any[]> {
  const hit = DOCS_CACHE.get(offeringId);
  if (hit && Date.now() - hit.at < DOCS_TTL) return hit.v;
  const { data } = await db()
    .from("offering_documents")
    .select("id, title, doc_type, document_category, sort_order, requires_signature, applies_to, usage, applicability, active_version")
    .eq("offering_id", offeringId);
  const v = (data ?? []) as any[];
  DOCS_CACHE.set(offeringId, { at: Date.now(), v });
  return v;
}

// ------------------------------------------------------------ facts

const onlyOne = (list: any[] | undefined) => (list && list.length === 1 ? list[0] : null); // maybeSingle semantics

/**
 * Every read readiness needs, for many onboardings at once: one request per table (IDs chunked
 * 100 at a time, at most 4 in flight). Throws on any failed read — never returns empty facts.
 * Single-investor readiness calls this with one row, so both paths share one implementation.
 */
export async function loadReadinessInputs(rows: any[]) {
  const { readIn, groupBy, loadStage2Inputs } = await import("@/lib/onboarding-compliance.server");
  const { loadProvenanceMany } = await import("@/lib/prepared-investor.server");
  const { latestPriors } = await import("@/lib/prior-subscription.server");
  const d = db();
  const offIds = rows.map((r) => r.offering_id);
  const profIds = rows.map((r) => r.investment_profile_id);
  const appIds = rows.map((r) => r.application_id);
  const obIds = rows.map((r) => r.id);
  const [offs, reqs, setups, pById, pByUser, profiles, evs, rels, accs, taxes, sigsA, sigsP, docs, acks, snaps, excs, prov, priors, stage2] = await Promise.all([
    readIn(offIds, (c) => d.from("offerings").select("*").in("id", c)),
    readIn(offIds, (c) => d.from("offering_requirements").select("*").in("offering_id", c)),
    readIn(offIds, (c) => d.from("fund_setups").select("*").in("offering_id", c)),
    readIn(rows.map((r) => r.person_id), (c) => d.from("persons").select("*").in("id", c)),
    readIn(rows.filter((r) => !r.person_id).map((r) => r.investor_user_id), (c) => d.from("persons").select("*").in("user_id", c)),
    readIn(profIds, (c) => d.from("investment_profiles").select("*").in("id", c)),
    readIn(profIds, (c) => d.from("entity_verifications").select("*").in("profile_id", c)),
    readIn(profIds, (c) => d.from("investment_profile_relationships").select("*").in("profile_id", c)),
    readIn(appIds, (c) => d.from("accreditation_records").select("*").in("application_id", c)),
    readIn(profIds, (c) => d.from("investor_tax_profiles").select("*").in("investment_profile_id", c)),
    readIn(appIds, (c) => d.from("document_signatures").select("*").in("application_id", c)),
    readIn(profIds, (c) => d.from("document_signatures").select("*").in("investment_profile_id", c)),
    readIn(offIds, (c) => d.from("offering_documents").select("id, offering_id, title, doc_type, document_category, sort_order, requires_signature, applies_to, usage, applicability, active_version").in("offering_id", c)),
    readIn(obIds, (c) => d.from("investment_document_acknowledgments").select("onboarding_id, offering_document_id, version").in("onboarding_id", c)),
    readIn(obIds, (c) => d.from("investor_document_snapshots").select("id, onboarding_id, status").in("onboarding_id", c)),
    readIn(obIds, (c) => d.from("investor_onboarding_exceptions").select("*").in("onboarding_id", c).eq("status", "open")),
    loadProvenanceMany(d, rows),
    latestPriors([...new Set(obIds)]),
    loadStage2Inputs(rows.filter((r) => r.investment_profile_id)),
  ]);
  // Profile accreditations and uploaded profile documents, read once for every row.
  const DOC_COLS = "id, file_name, doc_kind, uploaded_at, review_status, review_note, investment_profile_id, onboarding_id, user_id, prepared_for_person_id";
  const personIds = [...new Set([...pById, ...pByUser].map((p: any) => String(p.id)))];
  const [profAccs, docsByProfile, legacyDocs, kycRows] = await Promise.all([
    readIn(profIds, (c) => d.from("profile_accreditations").select("profile_id, status, verification_method, verified_at, expires_at, offering_id").in("profile_id", c)),
    readIn(profIds, (c) => d.from("investor_documents").select(DOC_COLS).in("investment_profile_id", c)),
    readIn(rows.filter((r) => r.investment_profile_id && r.investor_user_id).map((r) => r.id), (c) => d.from("investor_documents").select(DOC_COLS).is("investment_profile_id", null).in("onboarding_id", c)),
    readIn(personIds, (c) => d.from("kyc_verifications").select("person_id, provider_decision, liveness_status, face_match_status, verified_full_name, completed_at").in("person_id", c)),
  ]);
  const configs = await readIn(setups.map((s) => s.id), (c) => d.from("fund_eligibility_configs").select("*").in("setup_id", c).eq("status", "approved").order("version", { ascending: false }));
  const sigs = new Map<string, any>();
  for (const s of [...sigsA, ...sigsP]) if (!sigs.has(s.id)) sigs.set(s.id, s);
  const strip = (list: any[] | undefined, key: string) => (list ?? []).map((x) => { const y = { ...x }; delete y[key]; return y; });
  return {
    offerings: new Map(offs.map((o) => [String(o.id), o])),
    requirements: groupBy(reqs, "offering_id"),
    setups: groupBy(setups, "offering_id"),
    configs: groupBy(configs, "setup_id"),
    personsById: new Map(pById.map((p) => [String(p.id), p])),
    personsByUser: groupBy(pByUser, "user_id"),
    profiles: new Map(profiles.map((p) => [String(p.id), p])),
    entities: groupBy(evs, "profile_id"),
    related: groupBy(rels, "profile_id"),
    accreditations: groupBy(accs, "application_id"),
    taxProfiles: groupBy(taxes, "investment_profile_id"),
    signatures: [...sigs.values()],
    docs: groupBy(docs, "offering_id"),
    acks: groupBy(acks, "onboarding_id"),
    snaps: groupBy(snaps, "onboarding_id"),
    exceptions: groupBy(excs, "onboarding_id"),
    provenance: prov,
    priors,
    outside: await (await import("@/lib/prior-signed-documents.server")).outsideSubscriptionStates(d, obIds),
    stage2,
    profileAccreditations: groupBy(profAccs, "profile_id"),
    profileDocuments: [...docsByProfile, ...legacyDocs],
    kycByPerson: groupBy(kycRows, "person_id"),
    strip,
  };
}
export type ReadinessInputs = Awaited<ReturnType<typeof loadReadinessInputs>>;

/**
 * True only when identity sessions exist for the person and none was ever
 * submitted to the provider (no decision, no liveness, no face match, no name).
 * Such a check has nothing for compliance to review, so the investor must be
 * able to start again instead of waiting forever.
 */
export function kycNeverSubmitted(list: any[] | undefined): boolean {
  if (!list || list.length === 0) return false;
  const touched = (v: unknown) => v != null && !["", "not_started", "none"].includes(String(v).toLowerCase());
  return list.every((k) => !touched(k.provider_decision) && !touched(k.liveness_status) && !touched(k.face_match_status) && !k.verified_full_name && !k.completed_at);
}

async function gatherFacts(row: any, inputs?: ReadinessInputs) {
  const I = inputs ?? (await loadReadinessInputs([row]));
  const off = I.offerings.get(String(row.offering_id)) ?? null;
  const setup = onlyOne(I.setups.get(String(row.offering_id)));
  const offering = requirementsFrom(
    off,
    onlyOne(I.requirements.get(String(row.offering_id))),
    setup,
    (setup?.id ? (I.configs.get(String(setup.id))?.[0]?.rules ?? {}) : {}) as Record<string, any>,
  );

  const person = row.person_id ? (I.personsById.get(String(row.person_id)) ?? null) : onlyOne(I.personsByUser.get(String(row.investor_user_id)));

  let profile: any = null;
  let entity: any = null;
  let related: any[] = [];
  if (row.investment_profile_id) {
    profile = I.profiles.get(String(row.investment_profile_id)) ?? null;
    entity = onlyOne(I.entities.get(String(row.investment_profile_id)));
    related = I.related.get(String(row.investment_profile_id)) ?? [];
  }

  const accreditations = row.application_id ? (I.accreditations.get(String(row.application_id)) ?? []) : [];
  const taxProfiles = row.investment_profile_id ? (I.taxProfiles.get(String(row.investment_profile_id)) ?? []) : [];
  const signatures = row.application_id || row.investment_profile_id
    ? I.signatures.filter((s) => (row.application_id && s.application_id === row.application_id) || (row.investment_profile_id && s.investment_profile_id === row.investment_profile_id))
    : [];
  const offeringDocs = I.strip(I.docs.get(String(row.offering_id)), "offering_id");

  // Investor-confirmed facts outrank prepared values; unreviewed prepared values never drive requirements.
  // A failed provenance read now throws in the loader instead of silently dropping confirmed facts.
  const { effectiveResolverFacts, docApplies, confirmedFacts } = await import("@/lib/prepared-investor-workflow");
  const confirmed = confirmedFacts(I.provenance.get(String(row.id))?.prov ?? {});
  const eff = effectiveResolverFacts(
    { profileType: profile?.profile_type ?? null, requestedAmountCents: row.requested_amount_cents ?? null, country: person?.residence_country ?? null },
    confirmed,
  );
  const { documentApplies, documentObligations, acknowledgmentsComplete } = await import("@/lib/offering-document-model");
  // Legacy profile rule plus Fund Setup applicability (profile type and class).
  const applicableDocs = ((offeringDocs ?? []) as any[]).filter(
    (d) =>
      docApplies(d.applies_to, eff.profileType) &&
      documentApplies(d.applicability, { profileType: eff.profileType ?? null, classKey: row.offering_class_key ?? null }),
  );
  const obligations = documentObligations(
    applicableDocs.map((d) => ({ id: String(d.id), usage: d.usage ?? null, legacyRequiresSignature: Boolean(d.requires_signature), activeVersion: d.active_version ?? null })),
  );
  const ackRows = obligations.needsAck.length ? I.strip(I.acks.get(String(row.id)), "onboarding_id") : [];
  const acksDone = acknowledgmentsComplete(
    obligations.needsAck,
    ((ackRows ?? []) as any[]).map((a) => ({ documentId: String(a.offering_document_id), version: Number(a.version) })),
  );

  const profileAccreditations = row.investment_profile_id ? I.strip(I.profileAccreditations.get(String(row.investment_profile_id)), "profile_id") : [];
  const reusableAccreditation = reusableProfileAccreditation(profileAccreditations ?? [], row.offering_id);
  const accreditation = reusableAccreditation
    ? { ...reusableAccreditation, method: reusableAccreditation.verification_method }
    : ((accreditations ?? []) as any[])[0] ?? null;
  const tax = ((taxProfiles ?? []) as any[])[0] ?? null;
  // Only completion evidence written by the verified signing webhook counts.
  const docScope = {
    offeringDocumentIds: applicableDocs.map((d) => String(d.id)),
    investmentProfileId: (row.investment_profile_id ?? null) as string | null,
    applicationId: (row.application_id ?? null) as string | null,
  };
  // A completion only counts for the document version that is still current.
  const snapRows = I.snaps.get(String(row.id)) ?? [];
  const deadSnaps = new Set(((snapRows ?? []) as any[]).filter((x) => x.status === "stale" || x.status === "superseded").map((x) => x.id));
  const completedSignatures = ((signatures ?? []) as any[]).filter(
    (sig) => isAuthoritativeSignature(sig, docScope) && !(sig.snapshot_id && deadSnaps.has(sig.snapshot_id)),
  );
  // Reference-only and acknowledgment documents never require a signature.
  const signIds = new Set(obligations.needsSignature.map((d) => d.id));
  const requiredToSign = applicableDocs.filter((d) => signIds.has(String(d.id)));
  const signedIds = new Set(completedSignatures.map((sig) => sig.offering_document_id).filter(Boolean));
  const allSigned =
    completedSignatures.length > 0 &&
    (requiredToSign.length === 0 || requiredToSign.every((d) => signedIds.has(d.id)));
  const signedCount = allSigned ? completedSignatures.length : 0;

  const profileType = String(eff.profileType ?? "");
  const isEntity = ENTITY_PROFILE_TYPES.has(profileType as InvestmentProfileType);

  const gatingPeople = related
    .filter((r) => GATING_RELATIONSHIP_ROLES.has(r.role))
    .map((r) => ({
      role: String(r.role),
      personId: r.person_id as string | null,
      kycStatus: String(r.verification_status ?? ""),
    }));

  const { resolveStage2 } = await import("@/lib/onboarding-compliance.server");
  const stage2 = row.investment_profile_id
    ? await resolveStage2({
        onboarding: row,
        profileType: eff.profileType,
        tax,
        person,
        nowIso: nowIso(),
        taxRequired: offering.taxDocumentRequired,
      }, I.stage2)
    : null;

  const requirements = determineOnboardingRequirements({
    compliance: stage2
      ? {
          tax: stage2.taxState,
          taxClassification: stage2.taxClassificationState,
          bsaAml: stage2.amlState,
          badActor: stage2.badActorState,
          offeringEligibility: stage2.eligibilityState,
          certifications: stage2.certificationState,
        }
      : undefined,
    offering,
    person: {
      personId: person?.id ?? null,
      kycStatus: person?.kyc_status ?? null,
      kycExpiresAt: person?.reverification_due_at ?? null,
      amlStatus: person?.aml_status ?? null,
      amlCompletedAt: person?.aml_screened_at ?? null,
      countryOfResidence: eff.country,
      kycUnfinished: kycNeverSubmitted(person?.id ? I.kycByPerson?.get(String(person.id)) : undefined),
    },
    profile: profile
      ? {
          profileId: profile.id,
          profileType: eff.profileType,
          kybStatus: entity?.kyb_status ?? null,
          entityAmlStatus: entity?.entity_aml_status ?? null,
          entityVerificationExpiresAt: entity?.expires_at ?? null,
          relatedPeople: gatingPeople,
          accreditationStatus: accreditation?.status ?? null,
          accreditationExpiresAt: accreditation?.expires_at ?? null,
          accreditationMethod: accreditation?.method ?? null,
          taxFormStatus: tax?.documentation_status ?? null,
          taxFormExpiresOn: tax?.documentation_expires_on ?? null,
          taxClassification: tax?.classification ?? null,
          isForeign: String(tax?.classification ?? "") === "foreign",
          jurisdiction: entity?.formation_jurisdiction ?? person?.residence_country ?? null,
        }
      : null,
    subscription: {
      requestedAmountCents: eff.requestedAmountCents,
      questionnaireVersion: row.questionnaire_version,
      questionnaireComplete: Boolean(row.questionnaire_version),
      documentsPrepared: Boolean(row.document_template_version) && acksDone,
      signatureStatus: signedCount > 0 ? "completed" : null,
      fundingStatus: row.funding_status,
    },
    nowIso: nowIso(),
  });

  const { investorDocumentRank } = await import("@/lib/offering-document-model");
  const uploads = selectProfileDocumentEvidence(I.profileDocuments, row);
  const profileDocs = profileDocumentRequirements(eff.profileType ?? null, requirements,
    uploads.map((u) => ({ kind: u.doc_kind, status: u.review_status })), offering.accreditationMethod);
  const missingEntityDocs = profileDocs.filter((r) => r.kind !== "accreditation_proof" && !r.received);
  if (missingEntityDocs.length) {
    const entityRequirement = requirements.find((r) => r.key === "entity_verification");
    if (entityRequirement && entityRequirement.state !== "valid") {
      entityRequirement.state = "missing";
      entityRequirement.reason = `Upload: ${missingEntityDocs.map((r) => r.label).join(", ")}.`;
    }
  }
  const ackedIds = new Set(((ackRows ?? []) as any[]).map((a) => String(a.offering_document_id)));
  const ackIds = new Set(obligations.needsAck.map((x) => x.id));
  const documents = applicableDocs
    .map((d) => ({
      id: String(d.id),
      title: String(d.title ?? d.doc_type ?? "Document"),
      category: (d.document_category ?? d.doc_type ?? null) as string | null,
      requiresSignature: signIds.has(String(d.id)),
      requiresAcknowledgment: ackIds.has(String(d.id)),
      acknowledged: ackedIds.has(String(d.id)),
      signed: signedIds.has(d.id),
      rank: investorDocumentRank(d.document_category, d.doc_type),
      sort: Number(d.sort_order ?? 0),
    }))
    .sort((a, b) => a.rank - b.rank || a.sort - b.sort);
  let countersignTiming = (await import("@/lib/countersign-timing")).parseCountersignTiming(off?.countersign_timing);
  if (countersignTiming !== "pause" && !row.approved_to_fund_at) {
    // A timing change only applies to investors who hadn't signed yet when it changed.
    const [{ data: change }, { data: signed }] = await Promise.all([
      db().from("offering_countersign_timing_events").select("changed_at").eq("offering_id", row.offering_id).order("changed_at", { ascending: false }).limit(1),
      db().from("investor_onboarding_events").select("created_at").eq("onboarding_id", row.id).eq("event", "signature_completed").order("created_at", { ascending: true }).limit(1),
    ]);
    const changedAt = (change as any[] | null)?.[0]?.changed_at;
    const signedAt = (signed as any[] | null)?.[0]?.created_at;
    if (changedAt && signedAt && signedAt < changedAt) countersignTiming = "pause";
  }
  return { offering, person, profile, entity, related, accreditation, tax, requirements, isEntity, documents, completedSignatures, countersignTiming };
}

async function openExceptions(onboardingId: string) {
  const { data } = await db()
    .from("investor_onboarding_exceptions")
    .select("*")
    .eq("onboarding_id", onboardingId)
    .eq("status", "open");
  return (data ?? []) as any[];
}

// ----------------------------------------------------- investor journey

/** Public landing information. Approved, investor-facing fields only. */
export async function offeringLanding(slugOrId: string) {
  const { offering, setup } = await launchedOffering(slugOrId);
  return {
    offeringId: offering.id as string,
    slug: offering.slug as string,
    name: (setup.display_name ?? offering.name) as string,
    legalName: (offering.legal_entity_name ?? setup.legal_fund_name ?? null) as string | null,
    description: (offering.description ?? setup.investment_strategy ?? null) as string | null,
    minInvestmentCents: Number(setup.min_investment_cents ?? offering.min_investment_cents ?? 0),
    structure: setup.structure as string,
    targetClose: setup.target_close as string | null,
    onboardingUrl: setup.investor_onboarding_url as string | null,
  };
}

export async function startOnboarding(
  userId: string,
  input: { slugOrId: string; invitationToken?: string | null | undefined },
) {
  const actor = await onboardingActor(userId);
  const { offering } = await launchedOffering(input.slugOrId);

  let invitation: any = null;
  if (input.invitationToken) {
    const { data } = await db()
      .from("fund_invitations")
      .select("*")
      .eq("token", input.invitationToken)
      .maybeSingle();
    const problem = invitationUsableError(data, nowIso());
    if (problem) fail(problem);
    if (data.offering_id !== offering.id) fail("That invitation is for a different fund.");
    const { data: me } = await db().auth.admin.getUserById(actor.userId);
    const wrongPerson = invitationRecipientError(data.email, me?.user?.email ?? null);
    if (wrongPerson) fail(wrongPerson);
    invitation = data;
    // An invitation never grants access on its own: it only carries the
    // intended amount forward once the caller is authenticated.
  }

  // Continue records Harmonious or a Fund Manager prepared before sign-in.
  let claim: { review?: boolean; reviewOfferingIds?: string[] } = {};
  try {
    const { claimPreparedRecords } = await import("@/lib/investor-record.server");
    claim = await claimPreparedRecords(actor.userId);
  } catch (e) {
    console.error("[onboard] prepared-record claim skipped", (e as Error).message);
  }

  const { data: existing } = await db()
    .from("investor_onboardings")
    .select("*")
    .eq("offering_id", offering.id)
    .eq("investor_user_id", actor.userId)
    .not("stage", "in", "(closed,declined,cancelled)")
    .order("created_at", { ascending: false })
    .limit(1);
  const open = ((existing ?? []) as any[])[0];
  if (open) return { onboardingId: open.id as string, resumed: true, pendingReview: false };
  // A prepared investment in this Fund may be theirs but can't be linked safely:
  // wait for Harmonious instead of creating a duplicate.
  if (claim.review && claim.reviewOfferingIds?.includes(offering.id)) {
    return { onboardingId: null as string | null, resumed: false, pendingReview: true };
  }

  const { data: person } = await db()
    .from("persons")
    .select("id")
    .eq("user_id", actor.userId)
    .maybeSingle();

  const { data: created, error } = await db()
    .from("investor_onboardings")
    .insert({
      offering_id: offering.id,
      investor_user_id: actor.userId,
      person_id: person?.id ?? null,
      invitation_id: invitation?.id ?? null,
      requested_amount_cents: invitation?.intended_amount_cents ?? null,
      stage: "started",
    })
    .select("*")
    .single();
  if (error) {
    // A concurrent retry already opened it: return that one (idempotent).
    if ((error as any).code === "23505") {
      const { data: again } = await db().from("investor_onboardings").select("id").eq("offering_id", offering.id).eq("investor_user_id", actor.userId).not("stage", "in", "(closed,declined,cancelled)").order("created_at", { ascending: false }).limit(1);
      const row = ((again ?? []) as any[])[0];
      if (row) return { onboardingId: row.id as string, resumed: true, pendingReview: false };
    }
    fail(error.message);
  }

  if (invitation) {
    await db()
      .from("fund_invitations")
      .update({ onboarding_status: "account_created" })
      .eq("id", invitation.id);
  }
  await recordEvent({
    onboardingId: created.id,
    offeringId: offering.id,
    event: "onboarding_started",
    toStatus: "started",
    actorUserId: actor.userId,
    actorRole: "investor",
    detail: { invitationId: invitation?.id ?? null },
  });
  return { onboardingId: created.id as string, resumed: false, pendingReview: false };
}

/** The profiles this person may invest through, plus what they may create. */
export async function eligibleProfiles(userId: string) {
  const actor = await onboardingActor(userId);
  const { data } = await db()
    .from("investment_profiles")
    .select("id, display_label, profile_type, legal_name, status")
    .eq("owner_user_id", actor.userId)
    .order("created_at", { ascending: true });
  return { profiles: (data ?? []) as any[] };
}

export async function chooseProfile(
  userId: string,
  input: {
    onboardingId: string;
    profileId?: string | null | undefined;
    create?: { profileType: string; displayLabel: string; legalName?: string | null; kyc?: Record<string, string> | undefined } | undefined;
  },
) {
  const { actor, row } = await assertInvestorOwns(userId, input.onboardingId);

  let profileId = input.profileId ?? null;
  if (profileId) {
    // An investor can never substitute another person's profile id.
    const { data: profile } = await db()
      .from("investment_profiles")
      .select("id, owner_user_id")
      .eq("id", profileId)
      .maybeSingle();
    if (!profile || profile.owner_user_id !== actor.userId) forbid("that investment profile is not yours.");
  } else if (input.create) {
    if (!isInvestmentProfileType(input.create.profileType)) fail("Choose a supported kind of investor.");
    const { sanitizeKycInput } = await import("@/lib/kyc-fields");
    const kyc = sanitizeKycInput(input.create.profileType, input.create.kyc ?? {});
    if (kyc.missing.length) fail(`Please add: ${kyc.missing.join(", ")}.`);
    const { data: person } = await db()
      .from("persons")
      .select("id")
      .eq("user_id", actor.userId)
      .maybeSingle();
    const { data: created, error } = await db()
      .from("investment_profiles")
      .insert({
        owner_user_id: actor.userId,
        person_id: person?.id ?? null,
        profile_type: input.create.profileType,
        display_label: input.create.displayLabel,
        legal_name: input.create.legalName ?? null,
        ...kyc.columns,
        tax_id_last4: kyc.taxLast4,
        details: { kyc: kyc.details },
        status: "active",
      } as any)
      .select("id")
      .single();
    if (error) fail(error.message);
    profileId = created.id as string;
  } else {
    fail("Tell us who is making this investment.");
  }

  const problem = stageTransitionError(row.stage, "profile_selected");
  await touch(row.id, {
    investment_profile_id: profileId,
    ...(problem ? {} : { stage: "profile_selected" }),
  });
  await recordEvent({
    onboardingId: row.id,
    offeringId: row.offering_id,
    event: "profile_selected",
    subjectTable: "investment_profiles",
    subjectId: profileId,
    actorUserId: actor.userId,
    actorRole: "investor",
  });
  return { profileId };
}

export async function setInvestmentAmount(
  userId: string,
  input: { onboardingId: string; amountCents: number },
) {
  const { actor, row } = await assertInvestorOwns(userId, input.onboardingId);
  const offering = await offeringRequirements(row.offering_id);
  // Below the minimum is accepted with a side letter; the maximum and basic checks still apply.
  const { sideLetterRequired } = await import("@/lib/investor-onboarding-model");
  const problem = amountError(input.amountCents, { ...offering, minInvestmentCents: null } as any);
  if (problem) fail(problem);
  await touch(row.id, { requested_amount_cents: input.amountCents });
  if (sideLetterRequired(input.amountCents, offering.minInvestmentCents ?? null)) {
    const usd = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;
    const { notifySideLetterRequired } = await import("@/lib/investor-blocked-notify.server");
    await notifySideLetterRequired({ onboardingId: row.id, offeringId: row.offering_id, investorUserId: row.investor_user_id ?? null, commitment: usd(input.amountCents), minimum: usd(Number(offering.minInvestmentCents)) });
  }
  await recordEvent({
    onboardingId: row.id,
    offeringId: row.offering_id,
    event: "amount_requested",
    detail: { amountCents: input.amountCents },
    actorUserId: actor.userId,
    actorRole: "investor",
  });
  return { requestedAmountCents: input.amountCents };
}

/** The fund's own published questionnaire, else the Harmonious standard questionnaire. */
export async function publishedQuestionnaire(offeringId: string) {
  const { data } = await db()
    .from("offering_questionnaires")
    .select("*")
    .eq("offering_id", offeringId)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1);
  return ((data ?? []) as any[])[0] ?? STANDARD_QUESTIONNAIRE;
}

/** The person's most recent Didit session: their own verification, else a staff-confirmed link. */
export async function latestDiditSessionFor(personId: string | null): Promise<string | null> {
  if (!personId) return null;
  const [{ data: k }, { data: d }] = await Promise.all([
    db().from("kyc_verifications").select("session_id, updated_at").eq("person_id", personId).not("session_id", "is", null).order("updated_at", { ascending: false }).limit(1),
    db().from("source_reconciliation_decisions").select("source_ref, created_at").eq("source", "didit").eq("decision", "confirm_match").eq("proposed_person_id", personId).order("created_at", { ascending: false }).limit(1),
  ]);
  return ((k ?? []) as any[])[0]?.session_id ?? (((d ?? []) as any[])[0]?.source_ref as string | undefined)?.replace(/^session:/, "") ?? null;
}


/** Answers fixed by verified records, plus Verification-satisfied document questions. */
export async function subscriptionLocks(row: any, questions: Question[]) {
  const { lockedAnswers, suppliedInvestorAnswers, IDENTITY_DOCS_KEY } = await import("@/lib/subscription-prefill");
  const { resolveTaxForm } = await import("@/lib/onboarding-compliance-model");
  const { usPersonFrom } = await import("@/lib/onboarding-compliance.server");
  const [{ data: person }, { data: acct }, { data: profile }, { data: tax }] = await Promise.all([
    row.person_id ? db().from("persons").select("id, email, phone, date_of_birth, address_line1, address_line2, city, region, postal_code, country, mailing_address, tax_residency_country, residence_country, citizenship_country").eq("id", row.person_id).maybeSingle() : Promise.resolve({ data: null }),
    db().from("profiles").select("email, phone").eq("user_id", row.investor_user_id).maybeSingle(),
    row.investment_profile_id ? db().from("investment_profiles").select("profile_type, legal_name, country, address_line1, address_line2, city, region, postal_code, phone, details").eq("id", row.investment_profile_id).maybeSingle() : Promise.resolve({ data: null }),
    row.investment_profile_id ? db().from("investor_tax_profiles").select("*").eq("investment_profile_id", row.investment_profile_id).order("created_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
  ]) as any[];
  const { data: kyc } = person?.id
    ? await db().from("kyc_verifications").select("verified_full_name, status, completed_at, document_issuing_country").eq("person_id", person.id).eq("status", "approved").not("completed_at", "is", null).order("completed_at", { ascending: false }).limit(1)
    : { data: [] as any[] };
  const k = ((kyc ?? []) as any[])[0] ?? null;
  const profileType = (profile?.profile_type ?? null) as string | null;
  const isIndividual = profileType === "individual" || profileType === "joint";
  const verifiedName = isIndividual ? (k?.verified_full_name ?? null) : k ? (profile?.legal_name ?? null) : null;
  const { usPersonFromVerification } = await import("@/lib/subscription-prefill");
  const usPerson = k ? (usPersonFromVerification({ isIndividual, citizenshipCountry: person?.citizenship_country, documentCountry: k.document_issuing_country, entityCountry: profile?.country }) ?? usPersonFrom(tax, person)) : null;
  const routing = resolveTaxForm({ profileType, usPerson });
  const locked = lockedAnswers({
    verifiedName,
    commitmentCents: (row.accepted_amount_cents ?? row.requested_amount_cents ?? null) as number | null,
    email: person?.email ?? acct?.email ?? null,
    phone: person?.phone ?? acct?.phone ?? null,
    profileType,
    taxFormType: routing.status === "determined" ? routing.formType : null,
  });
  const decorated = questions.map((q) =>
    q.key in locked
      ? { ...q, locked: true }
      : q.key === IDENTITY_DOCS_KEY && isIndividual && k
        ? { ...q, satisfiedBy: "Your completed Verification already includes your ID and date of birth." }
        : q,
  );
  return { locked, supplied: suppliedInvestorAnswers(person, profile), questions: decorated };
}

export async function saveQuestionnaire(
  userId: string,
  input: { onboardingId: string; answers: Record<string, unknown>; submit?: boolean },
) {
  const { actor, row } = await assertInvestorOwns(userId, input.onboardingId);
  const questionnaire = await publishedQuestionnaire(row.offering_id);
  const { applyLocked, fillMissingInvestorAnswers } = await import("@/lib/subscription-prefill");
  const locks = await subscriptionLocks(row, (questionnaire?.questions ?? []) as Question[]);
  const questions = locks.questions;
  const { stripHiddenAnswers, highRiskYes } = await import("@/lib/investor-onboarding-model");
  const keys = questions.map((q) => q.key);
  const answers = stripHiddenAnswers(questions, applyLocked(fillMissingInvestorAnswers(input.answers, locks.supplied, keys), locks.locked, keys));

  if (input.submit) {
    const waiting = questions.find((q) => q.locked && q.required && locks.locked[q.key] == null);
    if (waiting) fail(`${waiting.label} fills in after Verification is complete.`);
    const result = validateQuestionnaire(questions, answers);
    if (!result.valid) fail(result.errors[0]!.message);
  }
  await touch(row.id, {
    questionnaire_responses: answers,
    questionnaire_source: "harmonious",
    questionnaire_didit_session_id: await latestDiditSessionFor(row.person_id ?? null),
    ...(input.submit ? { questionnaire_version: questionnaire?.version ?? 1, questionnaire_submitted_at: nowIso() } : {}),
  });
  try {
    const { autoApplyDiditForOnboarding } = await import("@/lib/didit-auto-apply.server");
    await autoApplyDiditForOnboarding(row.id, actor.userId);
  } catch (e) { console.error("[didit-auto]", (e as Error).message); }
  await recordEvent({
    onboardingId: row.id,
    offeringId: row.offering_id,
    event: input.submit ? "questionnaire_submitted" : "questionnaire_saved",
    actorUserId: actor.userId,
    actorRole: "investor",
  });
  const flagged = input.submit ? highRiskYes(questions, answers) : [];
  if (flagged.length) await holdForHighRiskDisclosure(row, actor.userId, flagged);
  return { saved: true, underReview: flagged.length > 0 };
}

export const HIGH_RISK_DETAIL_PREFIX = "Investor answered Yes to high-risk question";

/** A bad-actor "Yes" opens one blocking compliance issue and tells Harmonious and the fund team. */
async function holdForHighRiskDisclosure(row: any, actorUserId: string, flagged: { number: number }[]) {
  const nums = flagged.map((f) => f.number).join(", ");
  const { data: open } = await db()
    .from("investor_onboarding_exceptions")
    .select("id, detail")
    .eq("onboarding_id", row.id)
    .eq("status", "open")
    .eq("exception_type", "aml_review");
  if (((open ?? []) as any[]).some((e) => String(e.detail ?? "").startsWith(HIGH_RISK_DETAIL_PREFIX))) return;
  const detail = `${HIGH_RISK_DETAIL_PREFIX}${flagged.length > 1 ? "s" : ""} ${nums}. May not be eligible to invest; Harmonious must review before signing or funding.`;
  const { data: ex, error } = await db()
    .from("investor_onboarding_exceptions")
    .insert({ onboarding_id: row.id, exception_type: "aml_review", severity: "blocking", owner: "harmonious", detail, raised_by: actorUserId })
    .select("id")
    .single();
  if (error) { console.error("[high-risk hold]", error.message); return; }
  await recordEvent({ onboardingId: row.id, offeringId: row.offering_id, event: "exception_raised", toStatus: "aml_review", subjectTable: "investor_onboarding_exceptions", subjectId: ex.id, detail: { reason: "high_risk_disclosure", questions: nums }, actorUserId, actorRole: "investor" });
  try {
    const { notifyHighRiskDisclosure } = await import("@/lib/investor-blocked-notify.server");
    await notifyHighRiskDisclosure({ onboardingId: row.id, offeringId: row.offering_id, investorUserId: row.investor_user_id ?? null, questions: nums, ref: ex.id });
  } catch (e) { console.error("[high-risk notify]", (e as Error).message); }
}

/**
 * Freeze the exact subscription package the investor will sign. A later
 * template change can never alter an already prepared or executed package.
 */
/** Signing callers must re-read the exact investing party, not the login account's identity. */
export async function assertApplicationSigningVerification(userId: string, applicationId: string) {
  const { data: row, error } = await db().from("investor_onboardings").select("*")
    .eq("application_id", applicationId).eq("investor_user_id", userId).is("removed_at", null).maybeSingle();
  if (error) fail("We couldn't check verification. Please try again.");
  if (!row) fail("Your investment record is not ready for signing.");
  const { row: owned } = await assertInvestorOwns(userId, row.id);
  const facts = await gatherFacts(owned);
  if (!verificationAllowsSigning(facts.requirements)) fail("Identity and required verification must be approved before signing. Only pending compliance screening may continue.");
  if ((await openExceptions(owned.id)).some((e: any) => e.severity === "blocking")) {
    fail("Your investment is under review. We'll notify you about next steps.");
  }
}

export async function prepareSubscriptionDocuments(userId: string, onboardingId: string) {
  const { actor, row } = await assertInvestorOwns(userId, onboardingId);
  if (row.executed_snapshot) return { alreadyPrepared: true };

  const facts = await gatherFacts(row);
  const missing = outstandingRequirements(facts.requirements).filter(
    (r) => !["subscription_documents", "signature", "funding"].includes(r.key) && !signingRequirementSatisfied(r),
  );
  if (missing.length > 0) fail(`${missing[0]!.label} must be completed first.`);
  if ((await openExceptions(row.id)).some((e: any) => e.severity === "blocking")) {
    fail("Your investment is under review. We'll notify you about next steps.");
  }

  const { data: documents } = await db()
    .from("offering_documents")
    .select("id, doc_type, title, current_version, requires_signature")
    .eq("offering_id", row.offering_id)
    .order("sort_order");
  const docs = (documents ?? []) as any[];
  if (docs.length === 0) fail("This fund has no subscription documents yet.");

  const version = Math.max(...docs.map((d) => Number(d.current_version ?? 1)));
  await touch(row.id, { document_template_version: version, stage: "signature" });
  await recordEvent({
    onboardingId: row.id,
    offeringId: row.offering_id,
    event: "documents_generated",
    detail: { templateVersion: version, documents: docs.map((d) => ({ id: d.id, v: d.current_version })) },
    actorUserId: actor.userId,
    actorRole: "investor",
  });
  return { templateVersion: version, documents: docs };
}

export async function recordSubscriptionSignature(
  userId: string,
  input: { onboardingId: string; signerName: string; capacity?: string | null },
) {
  let { actor, row } = await assertInvestorOwns(userId, input.onboardingId);
  // Documents signed straight from the Documents page skip the prepare click;
  // record the document versions now instead of refusing the submission.
  if (!row.document_template_version && !row.executed_snapshot) {
    await prepareSubscriptionDocuments(userId, input.onboardingId);
    ({ actor, row } = await assertInvestorOwns(userId, input.onboardingId));
  }
  if (!row.document_template_version) fail("Your documents have not been prepared yet.");
  if (row.executed_snapshot) fail("This subscription has already been executed.");

  const facts = await gatherFacts(row);
  // The browser can never declare a document signed. The executed record is
  // written only once the signing provider has confirmed completion.
  const sigReq = facts.requirements.find((r: RequirementResult) => r.key === "signature");
  if (!sigReq || sigReq.state !== "valid") {
    fail("We haven't received confirmation that signing is complete yet. This updates automatically once it finishes.");
  }
  const entityName = facts.isEntity
    ? (facts.profile?.legal_name ?? facts.profile?.display_label ?? null)
    : null;

  // The executed snapshot is written once and never rewritten: later profile
  // edits cannot change what the investor actually signed.
  const snapshot = {
    signedAt: nowIso(),
    signerName: input.signerName,
    capacity: input.capacity ?? null,
    attribution: signatureAttribution({
      signerName: input.signerName,
      capacity: input.capacity ?? null,
      entityName,
    }),
    investmentProfileId: row.investment_profile_id,
    profileType: facts.profile?.profile_type ?? null,
    profileLegalName: facts.profile?.legal_name ?? null,
    offeringId: row.offering_id,
    requestedAmountCents: row.requested_amount_cents,
    documentTemplateVersion: row.document_template_version,
    questionnaireVersion: row.questionnaire_version,
  };

  // Production preflight: never reach Harmonious review with an unresolved dependency.
  const { onboardingPreflight } = await import("@/lib/onboarding-compliance.server");
  const blockers = await onboardingPreflight(row.id);
  if (blockers.length) {
    await recordEvent({
      onboardingId: row.id, offeringId: row.offering_id, event: "preflight_blocked",
      detail: { blockers }, actorUserId: actor.userId, actorRole: "investor",
    });
    fail("Harmonious needs to complete part of the setup before you can continue.");
  }
  await touch(row.id, { executed_snapshot: snapshot, stage: "harmonious_review" });
  await recordEvent({
    onboardingId: row.id,
    offeringId: row.offering_id,
    event: "signature_completed",
    toStatus: "harmonious_review",
    detail: { attribution: snapshot.attribution },
    actorUserId: actor.userId,
    actorRole: "investor",
  });
  await syncInvitation(row);
  const { notifyInvestorApproval } = await import('@/lib/investor-approval-notify.server');
  await notifyInvestorApproval({ onboardingId: row.id, action: 'review', ref: `submitted:${row.id}` });
  return { executed: snapshot };
}

async function syncInvitation(row: any) {
  if (!row.invitation_id) return;
  const { data } = await db()
    .from("investor_onboardings")
    .select("stage")
    .eq("id", row.id)
    .maybeSingle();
  await db()
    .from("fund_invitations")
    .update({ onboarding_status: invitationStatusForStage(String(data?.stage ?? row.stage) as OnboardingStage) })
    .eq("id", row.invitation_id);
}

/** "I sent my funds" - informational only; it never makes an investment funded. */
export type WireSentDetails = {
  sentOn?: string | null | undefined;
  amountCents?: number | null | undefined;
  sendingBank?: string | null | undefined;
  reference?: string | null | undefined;
};

/** Investor's own notice that they sent a wire. Never moves money and never
 *  marks the investment funded: only a matched bank receipt does that. */
export async function investorReportsFundsSent(userId: string, onboardingId: string, details: WireSentDetails = {}) {
  const { actor, row } = await assertInvestorOwns(userId, onboardingId);
  if (!row.approved_to_fund_at) {
    const facts = await gatherFacts(row);
    const exceptions = await openExceptions(row.id);
    const gate = canInvestorFund({ stage: row.stage, requirements: facts.requirements, approvedToFundAt: null, countersignTiming: facts.countersignTiming, openBlockingExceptions: exceptions.filter((e) => e.severity === "blocking").length });
    if (!gate.allowed) forbid("funding has not been unlocked for this investment.");
  }
  const amount = details.amountCents == null ? null : Math.round(Number(details.amountCents));
  if (amount != null && (!Number.isFinite(amount) || amount <= 0)) fail("Enter the amount you sent.");
  const sentOn = details.sentOn && /^\d{4}-\d{2}-\d{2}$/.test(details.sentOn) ? details.sentOn : null;
  // Free text is trimmed and long digit runs are masked so account numbers are never stored.
  const clean = (v?: string | null) => (v ? v.trim().slice(0, 120).replace(/\d{5,}/g, (m) => `••••${m.slice(-4)}`) : null);
  await touch(row.id, {
    investor_reports_sent_at: row.investor_reports_sent_at ?? nowIso(),
    funding_status: row.funding_status === "not_funded" ? "investor_reports_sent" : row.funding_status,
  });
  await requestCountersignIfDue(row.id, "on_funding_step", actor.userId).catch(() => null);
  await recordEvent({
    onboardingId: row.id,
    offeringId: row.offering_id,
    event: "investor_reports_funds_sent",
    detail: { sentOn, amountCents: amount, sendingBank: clean(details.sendingBank), reference: clean(details.reference) },
    actorUserId: actor.userId,
    actorRole: "investor",
  });
  return { acknowledged: true };
}

/** Read-only funding ledger for the investor: expected amount, their wire notices
 *  and Harmonious-confirmed receipts, with a running received balance. */
export async function investorFundingLedger(userId: string, onboardingId: string) {
  const { row } = await assertInvestorOwns(userId, onboardingId);
  const { data } = await db()
    .from("investor_onboarding_events")
    .select("id, event, detail, created_at")
    .eq("onboarding_id", row.id)
    .in("event", ["approved_to_fund", "investor_reports_funds_sent", "bank_transaction_matched"])
    .order("created_at", { ascending: true });
  let received = 0;
  const entries = ((data ?? []) as any[]).map((e) => {
    const d = (e.detail ?? {}) as any;
    if (e.event === "bank_transaction_matched") {
      received += Number(d.amountCents ?? 0);
      return { id: e.id, at: e.created_at, kind: "received", label: "Wire received and confirmed", amountCents: Number(d.amountCents ?? 0), balanceCents: received };
    }
    if (e.event === "investor_reports_funds_sent") {
      return { id: e.id, at: e.created_at, kind: "reported", label: "You reported a wire sent", amountCents: d.amountCents ?? null, sentOn: d.sentOn ?? null, sendingBank: d.sendingBank ?? null, reference: d.reference ?? null, balanceCents: received };
    }
    return { id: e.id, at: e.created_at, kind: "opened", label: "Funding opened", amountCents: null, balanceCents: received };
  });
  const expected = Number(row.accepted_amount_cents ?? row.requested_amount_cents ?? 0);
  return {
    expectedCents: expected,
    receivedCents: Number(row.funded_amount_cents ?? received),
    remainingCents: Math.max(0, expected - Number(row.funded_amount_cents ?? received)),
    fundingStatus: row.funding_status as string,
    entries: entries.reverse(),
  };
}

// ------------------------------------------------------ investor views

export async function myInvestments(userId: string) {
  const actor = await onboardingActor(userId);
  const { data } = await db()
    .from("investor_onboardings")
    .select("*")
    .eq("investor_user_id", actor.userId)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as any[];
  const offeringIds = [...new Set(rows.map((r) => r.offering_id))];
  const { data: offerings } = offeringIds.length
    ? await db().from("offerings").select("id, name, slug").in("id", offeringIds)
    : { data: [] as any[] };
  const byId = new Map(((offerings ?? []) as any[]).map((o) => [o.id, o]));
  return {
    investments: rows.map((r) => ({
      id: r.id as string,
      offeringId: r.offering_id as string,
      offeringName: (byId.get(r.offering_id)?.name ?? "Fund") as string,
      stage: r.stage as OnboardingStage,
      fundingStatus: r.funding_status as FundingStatus,
      requestedAmountCents: r.requested_amount_cents as number | null,
      acceptedAmountCents: r.accepted_amount_cents as number | null,
      investmentProfileId: r.investment_profile_id as string | null,
    })),
  };
}

/**
 * The investor's fund page status for one offering: journey steps plus the
 * application used for private messaging, derived from the single
 * authoritative onboarding row. No writes here, page views never change
 * operational state.
 */
export async function investorFundStatus(userId: string, offeringId: string) {
  const { data } = await db()
    .from("investor_onboardings")
    .select("*")
    .eq("investor_user_id", userId)
    .eq("offering_id", offeringId)
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = ((data ?? []) as any[])[0];
  if (!row) return null;

  const facts = await gatherFacts(row);
  const earlyFunding = !row.approved_to_fund_at && facts.countersignTiming !== "pause"
    && canInvestorFund({ stage: row.stage, requirements: facts.requirements, approvedToFundAt: null, countersignTiming: facts.countersignTiming, openBlockingExceptions: (await openExceptions(row.id)).filter((e) => e.severity === "blocking").length }).allowed;
  const steps = journeySteps(facts.requirements, {
    stage: row.stage,
    approvedToFund: canInvestorFund({ stage: row.stage, requirements: facts.requirements, approvedToFundAt: row.approved_to_fund_at, countersignTiming: facts.countersignTiming, openBlockingExceptions: (await openExceptions(row.id)).filter((e) => e.severity === "blocking").length }).allowed || earlyFunding,
    fundingStatus: row.funding_status,
    investorReportsSent: Boolean(row.investor_reports_sent_at),
  });
  const summary = investorHomeSummary(steps);

  let applicationId: string | null = (row.application_id as string | null) ?? null;
  if (!applicationId) {
    const { data: apps } = await db()
      .from("investor_applications")
      .select("id")
      .eq("user_id", userId)
      .eq("offering_id", offeringId)
      .order("created_at", { ascending: true })
      .limit(1);
    applicationId = ((apps ?? []) as any[])[0]?.id ?? null;
  }

  return {
    onboardingId: row.id as string,
    applicationId,
    fundingStatus: (row.funding_status as string | null) ?? null,
    steps,
    summary,
  };
}

export async function onboardingDetail(userId: string, onboardingId: string): Promise<any> {
  const { actor, row, role } = await assertOnboardingAccess(userId, onboardingId);
  const facts = await gatherFacts(row);
  const exceptions = await openExceptions(row.id);
  const fundingGate = canInvestorFund({
    stage: row.stage,
    requirements: facts.requirements,
    approvedToFundAt: row.approved_to_fund_at,
    countersignTiming: facts.countersignTiming,
    openBlockingExceptions: exceptions.filter((e) => e.severity === "blocking").length,
  });

  const [{ data: offering }, { data: profiles }] = await Promise.all([
    db().from("offerings").select("id, name, slug, min_investment_cents").eq("id", row.offering_id).maybeSingle(),
    db()
      .from("investment_profiles")
      .select("id, display_label, profile_type")
      .eq("owner_user_id", row.investor_user_id),
  ]);

  const questionnaire = await publishedQuestionnaire(row.offering_id);
  const locks = questionnaire ? await subscriptionLocks(row, (questionnaire.questions ?? []) as Question[]) : null;
  const { fillMissingInvestorAnswers } = await import("@/lib/subscription-prefill");
  const journey = journeySteps(facts.requirements, {
    stage: row.stage,
    approvedToFund: fundingGate.allowed,
    fundingStatus: row.funding_status,
    investorReportsSent: Boolean(row.investor_reports_sent_at),
  });

  const base = {
    id: row.id as string,
    offering: {
      id: offering?.id,
      name: offering?.name,
      slug: offering?.slug,
      minInvestmentCents: offering?.min_investment_cents ?? 0,
    },
    stage: row.stage as OnboardingStage,
    fundingStatus: row.funding_status as FundingStatus,
    requestedAmountCents: row.requested_amount_cents as number | null,
    acceptedAmountCents: row.accepted_amount_cents as number | null,
    fundedAmountCents: row.funded_amount_cents as number,
    closedAmountCents: row.closed_amount_cents as number | null,
    investmentProfileId: row.investment_profile_id as string | null,
    profileLabel: (facts.profile?.display_label ?? null) as string | null,
    profileType: (facts.profile?.profile_type ?? null) as string | null,
    requirements: facts.requirements,
    checklist: progressChecklist(facts.requirements, Boolean(row.approved_to_fund_at)),
    approvedToFund: Boolean(row.approved_to_fund_at),
    fundingUnlocked: fundingGate.allowed,
    fundingBlockedReasons: fundingGate.reasons,
    countersignTiming: facts.countersignTiming,
    awaitingCountersign: !row.approved_to_fund_at && fundingGate.allowed,
    questionnaire: questionnaire ? { version: questionnaire.version, questions: locks?.questions ?? questionnaire.questions } : null,
    questionnaireResponses: { ...fillMissingInvestorAnswers((row.questionnaire_responses ?? {}) as Record<string, unknown>, locks?.supplied ?? {}, (questionnaire?.questions ?? []).map((q: Question) => q.key)), ...Object.fromEntries(Object.entries(locks?.locked ?? {}).filter(([, v]) => v != null)) },
    questionnaireLocked: locks?.locked ?? {},
    documentTemplateVersion: row.document_template_version as number | null,
    executedSnapshot: row.executed_snapshot,
    availableProfiles: (profiles ?? []) as any[],
    exceptions: exceptions.map((e) => ({
      id: e.id,
      type: e.exception_type,
      severity: e.severity,
      owner: e.owner,
      detail: e.detail,
    })),
    acceptedAt: row.accepted_at as string | null,
    closedAt: row.closed_at as string | null,
    exemption: (facts.offering as any).exemption ?? null,
    documents: facts.documents,
    verification: verificationSummary(facts.requirements),
    journey,
    nextStep: nextJourneyStep(journey),
    investorReportsSent: Boolean(row.investor_reports_sent_at),
  };

  if (role === "manager") {
    // Managers see progress, never compliance material or the executed snapshot.
    return managerSafeView({
      ...base,
      requirements: facts.requirements.map((r) => ({ key: r.key, label: r.label, state: r.state })),
      questionnaireResponses: {},
      actorRole: role,
    });
  }
  return { ...base, actorRole: role, actorUserId: actor.userId };
}

// --------------------------------------------------------- funding

/** Approved, versioned banking instructions: released only by Harmonious. */
export async function fundingInstructions(userId: string, onboardingId: string) {
  const { row, role } = await assertOnboardingAccess(userId, onboardingId);
  if (role === "manager") forbid("fund managers do not receive investor funding instructions.");
  const facts = await gatherFacts(row);
  const exceptions = await openExceptions(row.id);
  const gate = canInvestorFund({
    stage: row.stage,
    requirements: facts.requirements,
    approvedToFundAt: row.approved_to_fund_at,
    countersignTiming: facts.countersignTiming,
    openBlockingExceptions: exceptions.filter((e) => e.severity === "blocking").length,
  });
  if (!gate.allowed) return { unlocked: false, reasons: gate.reasons, instructions: null };

  // Server read of the released version only (investor access already checked above).
  const { data: wire } = await db().rpc("released_wire_details", { p_offering_id: row.offering_id });
  const rawDetails = (wire as Record<string, unknown> | null) ?? null;
  // Show only the instructions that apply: USA-only, international-only, or (for "both") by where the investor is located.
  const { instructionsForInvestor, DOMESTIC_WIRE_FIELDS, INTL_WIRE_FIELDS } = await import("@/lib/wire-scope");
  const { data: prof } = row.investment_profile_id ? await db().from("investment_profiles").select("country").eq("id", row.investment_profile_id).maybeSingle() : { data: null };
  const { data: per } = row.person_id ? await db().from("persons").select("residence_country, country").eq("id", row.person_id).maybeSingle() : { data: null };
  const investorCountry = (prof as any)?.country || (per as any)?.residence_country || (per as any)?.country || null;
  const shown = instructionsForInvestor(rawDetails, investorCountry);
  const keep = new Set<string>([...(shown.domestic ? DOMESTIC_WIRE_FIELDS : []), ...(shown.international ? INTL_WIRE_FIELDS : [])]);
  const details = rawDetails ? Object.fromEntries(Object.entries(rawDetails as Record<string, unknown>).filter(([k, v]) => keep.has(k) && String(v ?? "").trim()).map(([k, v]) => [k, String(v)])) as Record<string, string> : null;
  const { data: setup } = await db()
    .from("fund_setups")
    .select("id")
    .eq("offering_id", row.offering_id)
    .maybeSingle();
  const { data: banking } = setup?.id
    ? await db().from("fund_banking_setups").select("*").eq("setup_id", setup.id).maybeSingle()
    : { data: null };

  const { wireReleaseState } = await import("@/lib/wire-release.server");
  const { wireReleaseBlocker } = await import("@/lib/wire-release");
  const release = await wireReleaseState(row.offering_id);
  if (!banking || !release.available || !details || Object.keys(details).length === 0) {
    return {
      unlocked: false,
      reasons: [wireReleaseBlocker(release) ?? "The fund's banking instructions have not been released yet."],
      instructions: null,
    };
  }
  const { normalizePaymentMethods, PAYMENT_METHOD_TIMELINE } = await import("@/lib/payment-methods");
  const { data: pm } = await db().from("offerings").select("payment_methods, check_payable_to, check_mail_address").eq("id", row.offering_id).maybeSingle();
  const methods = normalizePaymentMethods((pm as any)?.payment_methods).filter((m) => m !== "ach" || !!shown.domestic);
  return {
    unlocked: true,
    reasons: [] as string[],
    instructions: {
      methods: methods.map((m) => ({ method: m, timeline: PAYMENT_METHOD_TIMELINE[m] })),
      check: methods.includes("check") ? { payableTo: (pm as any)?.check_payable_to ?? null, mailTo: (pm as any)?.check_mail_address ?? null } : null,
      bankName: banking.bank_name as string | null,
      details,
      expectedAmountCents: row.accepted_amount_cents ?? row.requested_amount_cents,
      reference: `${String(row.id).slice(0, 8).toUpperCase()}`,
      warning:
        "Always confirm funding instructions inside this portal. Harmonious will never send changed bank details by email.",
    },
  };
}

// ---------------------------------------------- Harmonious operations

export async function reviewQueue(
  userId: string,
  filters: {
    offeringId?: string | null;
    bucket?: string | null;
    investorUserId?: string | null;
    assignedTo?: string | null;
  } = {},
) {
  await assertStaff(userId);
  let query = db().from("investor_onboardings").select("*").order("last_activity_at", { ascending: true });
  if (filters.offeringId) query = query.eq("offering_id", filters.offeringId);
  if (filters.investorUserId) query = query.eq("investor_user_id", filters.investorUserId);
  if (filters.assignedTo) query = query.eq("assigned_to", filters.assignedTo);
  const { data } = await query;
  const rows = (data ?? []) as any[];

  // Investor corrections of prepared material facts get surfaced for Harmonious review.
  const { data: corr } = rows.length
    ? await db().from("investor_prep_field_reviews").select("onboarding_id").eq("action", "corrected").eq("material", true)
        .in("onboarding_id", rows.map((r) => r.id))
    : { data: [] as any[] };
  const correctionCount = new Map<string, number>();
  for (const c of (corr ?? []) as any[]) correctionCount.set(c.onboarding_id, (correctionCount.get(c.onboarding_id) ?? 0) + 1);

  const items = [] as any[];
  for (const row of rows) {
    const facts = await gatherFacts(row);
    const exceptions = await openExceptions(row.id);
    const bucket = queueBucket({
      stage: row.stage,
      fundingStatus: row.funding_status,
      requirements: facts.requirements,
      exceptionTypes: exceptions.map((e) => e.exception_type as ExceptionType),
      acceptedAt: row.accepted_at,
    });
    items.push({
      id: row.id,
      offeringId: row.offering_id,
      investorUserId: row.investor_user_id,
      investmentProfileId: row.investment_profile_id,
      profileLabel: facts.profile?.display_label ?? null,
      stage: row.stage,
      bucket,
      fundingStatus: row.funding_status,
      requestedAmountCents: row.requested_amount_cents,
      acceptedAmountCents: row.accepted_amount_cents,
      exceptions: exceptions.length,
      materialCorrections: correctionCount.get(row.id) ?? 0,
      assignedTo: row.assigned_to,
      ageDays: Math.floor(
        (Date.now() - new Date(row.last_activity_at ?? row.created_at).getTime()) / 86_400_000,
      ),
    });
  }
  const filtered = filters.bucket ? items.filter((i) => i.bucket === filters.bucket) : items;

  const offeringIds = [...new Set(filtered.map((i) => i.offeringId))];
  const investorIds = [...new Set(filtered.map((i) => i.investorUserId))];
  const [{ data: offerings }, { data: people }] = await Promise.all([
    offeringIds.length
      ? db().from("offerings").select("id, name").in("id", offeringIds)
      : Promise.resolve({ data: [] as any[] }),
    investorIds.length
      ? db().from("profiles").select("user_id, legal_name, email").in("user_id", investorIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const offeringName = new Map(((offerings ?? []) as any[]).map((o) => [o.id, o.name]));
  const investor = new Map(((people ?? []) as any[]).map((p) => [p.user_id, p]));

  return {
    items: filtered.map((i) => ({
      ...i,
      offeringName: offeringName.get(i.offeringId) ?? "Fund",
      investorName: investor.get(i.investorUserId)?.legal_name ?? investor.get(i.investorUserId)?.email ?? "Investor",
      investorEmail: investor.get(i.investorUserId)?.email ?? null,
    })),
  };
}

/** One consolidated page: everything Harmonious needs to decide. */
export async function reviewDetail(userId: string, onboardingId: string) {
  await assertStaff(userId);
  const row = await onboardingRow(onboardingId);
  const facts = await gatherFacts(row);
  const exceptions = await openExceptions(row.id);
  const [{ data: allExceptions }, { data: events }, { data: investorProfile }] = await Promise.all([
    db()
      .from("investor_onboarding_exceptions")
      .select("*")
      .eq("onboarding_id", row.id)
      .order("created_at", { ascending: false }),
    db()
      .from("investor_onboarding_events")
      .select("*")
      .eq("onboarding_id", row.id)
      .order("created_at", { ascending: false })
      .limit(100),
    db().from("profiles").select("user_id, legal_name, email").eq("user_id", row.investor_user_id).maybeSingle(),
  ]);

  const blocking = exceptions.filter((e) => e.severity === "blocking").length;
  const fundingGate = canInvestorFund({
    stage: row.stage,
    requirements: facts.requirements,
    approvedToFundAt: row.approved_to_fund_at,
    countersignTiming: facts.countersignTiming,
    openBlockingExceptions: blocking,
  });
  const closingGate = canCloseInvestment({
    stage: row.stage,
    requirements: facts.requirements,
    approvedToFundAt: row.approved_to_fund_at,
    countersignTiming: facts.countersignTiming,
    openBlockingExceptions: blocking,
    fundingStatus: row.funding_status,
    fundingReconciled: isReconciledFunding(row.funding_status),
    acceptedAt: row.accepted_at,
    acceptedAmountCents: row.accepted_amount_cents,
  });

  return {
    onboarding: row,
    investor: investorProfile ?? null,
    profile: facts.profile,
    entity: facts.entity,
    relatedPeople: facts.related.map((r) => ({
      role: r.role,
      personId: r.person_id,
      ownershipPercent: r.ownership_percent,
      isAuthorizedSigner: r.is_authorized_signer,
      verificationStatus: r.verification_status,
    })),
    person: facts.person
      ? {
          id: facts.person.id,
          kycStatus: facts.person.kyc_status,
          amlStatus: facts.person.aml_status,
          // Never the reference or full identifier - last four only.
          taxIdLast4: facts.person.tax_id_last4,
        }
      : null,
    accreditation: facts.accreditation,
    tax: facts.tax,
    requirements: facts.requirements,
    exceptions: (allExceptions ?? []) as any[],
    events: (events ?? []) as any[],
    canApproveToFund: outstandingRequirements(facts.requirements).length === 0 && blocking === 0,
    fundingGate,
    closingGate,
  };
}

export async function approveToFund(userId: string, input: { onboardingId: string; acceptedAmountCents?: number }) {
  const row = await onboardingRow(input.onboardingId);
  const actor = await onboardingActor(userId);
  if (!actor.isStaff && !actor.managedOfferingIds.includes(row.offering_id)) forbid("Only authorized Harmonious staff or a fund manager assigned to this fund may approve the subscription.");
  if (row.investor_user_id === userId) forbid("Another authorized reviewer must approve your own subscription.");
  const facts = await gatherFacts(row);
  const exceptions = await openExceptions(row.id);
  const blocking = exceptions.filter((e) => e.severity === "blocking").length;
  const outstanding = outstandingRequirements(facts.requirements);
  const firstOutstanding = outstanding[0];
  if (firstOutstanding) fail(`${firstOutstanding.label} is not complete.`);
  if (blocking > 0) fail("Resolve the open issues on this investment first.");

  const accepted = Number(input.acceptedAmountCents ?? row.requested_amount_cents ?? 0);
  if (accepted <= 0) fail("Record the accepted subscription amount.");

  const problem = stageTransitionError(row.stage, "approved_to_fund");
  if (problem) fail(problem);

  await touch(row.id, {
    stage: "approved_to_fund",
    accepted_amount_cents: accepted,
    approved_to_fund_by: actor.userId,
    approved_to_fund_at: nowIso(),
    funding_released_at: nowIso(),
  });
  await recordEvent({
    onboardingId: row.id,
    offeringId: row.offering_id,
    event: "approved_to_fund",
    fromStatus: row.stage,
    toStatus: "approved_to_fund",
    detail: { acceptedAmountCents: accepted },
    actorUserId: actor.userId,
    actorRole: actor.isStaff ? "harmonious" : "fund_manager",
  });
  await touch(row.id, { stage: "awaiting_funds" });
  await syncInvitation(row);
  const { notifyInvestorApproval } = await import('@/lib/investor-approval-notify.server');
  await notifyInvestorApproval({ onboardingId: row.id, action: 'fund', ref: `approved:${row.id}` });
  return { approved: true, acceptedAmountCents: accepted };
}

export async function setOnboardingStage(userId: string, input: { onboardingId: string; stage: string }) {
  const actor = await assertStaff(userId);
  const row = await onboardingRow(input.onboardingId);
  const problem = stageTransitionError(row.stage, input.stage);
  if (problem) fail(problem);
  await touch(row.id, { stage: input.stage });
  await recordEvent({
    onboardingId: row.id,
    offeringId: row.offering_id,
    event: "stage_changed",
    fromStatus: row.stage,
    toStatus: input.stage,
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { stage: input.stage };
}

export async function assignOnboarding(userId: string, input: { onboardingId: string; assignee: string | null }) {
  const actor = await assertStaff(userId);
  await touch(input.onboardingId, { assigned_to: input.assignee });
  await recordEvent({
    onboardingId: input.onboardingId,
    event: "assigned",
    detail: { assignee: input.assignee },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { assigned: input.assignee };
}

// -------------------------------------------------------- exceptions

export async function raiseException(
  userId: string,
  input: {
    onboardingId: string;
    type: string;
    severity?: string;
    owner?: string;
    detail?: string | null;
  },
) {
  const actor = await assertStaff(userId);
  if (!isExceptionType(input.type)) fail("That is not a recognized exception.");
  const { data, error } = await db()
    .from("investor_onboarding_exceptions")
    .insert({
      onboarding_id: input.onboardingId,
      exception_type: input.type,
      severity: input.severity ?? "blocking",
      owner: input.owner ?? "harmonious",
      detail: input.detail ?? null,
      raised_by: actor.userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  await recordEvent({
    onboardingId: input.onboardingId,
    event: "exception_raised",
    toStatus: input.type,
    subjectTable: "investor_onboarding_exceptions",
    subjectId: data.id,
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { exceptionId: data.id as string };
}

export async function resolveException(
  userId: string,
  input: { exceptionId: string; resolution: string },
) {
  const actor = await assertStaff(userId);
  const { data: existing } = await db()
    .from("investor_onboarding_exceptions")
    .select("*")
    .eq("id", input.exceptionId)
    .maybeSingle();
  if (!existing) fail("That issue was not found.");
  await db()
    .from("investor_onboarding_exceptions")
    .update({
      status: "resolved",
      resolution: input.resolution,
      resolved_by: actor.userId,
      resolved_at: nowIso(),
    })
    .eq("id", input.exceptionId);
  await recordEvent({
    onboardingId: existing.onboarding_id,
    event: "exception_resolved",
    subjectTable: "investor_onboarding_exceptions",
    subjectId: input.exceptionId,
    detail: { resolution: input.resolution },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return { resolved: true };
}

// ------------------------------------------------ funding reconciliation

/**
 * Apply an authoritative bank transaction to an investor. Harmonious only;
 * ambiguous activity is refused and raised as an exception instead.
 */
export async function applyBankActivity(
  userId: string,
  input: { bankTransactionId: string; onboardingId?: string | null },
) {
  const actor = await assertStaff(userId);
  const { data: txn } = await db()
    .from("bank_transactions")
    .select("*")
    .eq("id", input.bankTransactionId)
    .maybeSingle();
  if (!txn) fail("That bank transaction was not found.");

  const { data: candidatesRaw } = await db()
    .from("investor_onboardings")
    .select("*")
    .eq("offering_id", txn.offering_id)
    .in("stage", ["approved_to_fund", "awaiting_funds", "funded"]);
  const candidates = ((candidatesRaw ?? []) as any[]).map((c) => ({
    onboardingId: c.id as string,
    offeringId: c.offering_id as string,
    investorUserId: c.investor_user_id as string,
    investmentProfileId: c.investment_profile_id as string | null,
    expectedAmountCents: Number(c.accepted_amount_cents ?? c.requested_amount_cents ?? 0),
    reference: String(c.id).slice(0, 8).toUpperCase(),
  }));

  const { data: applied } = await db()
    .from("investor_onboarding_events")
    .select("subject_id")
    .eq("event", "bank_transaction_matched");
  const appliedIds = ((applied ?? []) as any[]).map((a) => String(a.subject_id));

  let onboardingId = input.onboardingId ?? null;
  let reasons: string[] = ["Matched by Harmonious"];
  if (!onboardingId) {
    const outcome = matchBankActivity(
      {
        offeringId: txn.offering_id,
        amountCents: Number(txn.amount_cents),
        reference: txn.description ?? txn.name,
        postedOn: txn.posted_on,
        transactionId: txn.id,
      },
      candidates,
      appliedIds,
    );
    if (outcome.kind === "exception") {
      return { matched: false, reason: outcome.reason, candidates: outcome.candidates };
    }
    onboardingId = outcome.onboardingId;
    reasons = outcome.reasons;
  } else if (appliedIds.includes(String(txn.id))) {
    fail("This bank transaction has already been applied to an investment.");
  }

  const row = await onboardingRow(onboardingId);
  const expected = Number(row.accepted_amount_cents ?? row.requested_amount_cents ?? 0);
  const funded = Number(row.funded_amount_cents ?? 0) + Number(txn.amount_cents);
  const status: FundingStatus = deriveFundingStatus({
    acceptedAmountCents: expected,
    reconciledCents: funded,
  });

  await touch(row.id, {
    funded_amount_cents: funded,
    funding_status: status,
    ...(status === "funded" ? { stage: "funded" } : {}),
  });
  await recordEvent({
    onboardingId: row.id,
    offeringId: row.offering_id,
    event: "bank_transaction_matched",
    subjectTable: "bank_transactions",
    subjectId: txn.id,
    toStatus: status,
    detail: { amountCents: txn.amount_cents, reasons },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });

  if (status === "overfunded" || status === "partially_funded") {
    await raiseException(userId, {
      onboardingId: row.id,
      type: status === "overfunded" ? "overfunding" : "underfunding",
      severity: "blocking",
      detail: `Expected ${expected} cents, received ${funded} cents.`,
    });
  }
  await syncInvitation(row);
  return { matched: true, onboardingId: row.id, fundingStatus: status, fundedAmountCents: funded };
}

// ------------------------------------------------------ acceptance & close

export async function acceptSubscription(
  userId: string,
  input: { onboardingId: string; signerName: string; capacity: string },
) {
  const actor = await assertStaff(userId);
  const row = await onboardingRow(input.onboardingId);
  if (row.funding_status !== "funded") fail("The subscription can only be accepted once funds are reconciled.");
  const problem = stageTransitionError(row.stage, "accepted");
  if (problem) fail(problem);

  await touch(row.id, {
    stage: "accepted",
    accepted_by: actor.userId,
    accepted_at: nowIso(),
    acceptance_capacity: `${input.signerName} · ${input.capacity}`,
  });
  await recordEvent({
    onboardingId: row.id,
    offeringId: row.offering_id,
    event: "subscription_accepted",
    toStatus: "accepted",
    detail: {
      signerName: input.signerName,
      capacity: input.capacity,
      documentTemplateVersion: row.document_template_version,
    },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  await syncInvitation(row);
  const { onInvestmentAccepted } = await import("@/lib/drive.server");
  await onInvestmentAccepted(row.id, actor.userId);
  return { accepted: true };
}

/**
 * Closing links the existing accounting records. It never creates an
 * independent onboarding capital balance.
 */
export async function closeInvestment(userId: string, input: { onboardingId: string; closingDate?: string }) {
  const actor = await assertStaff(userId);
  const row = await onboardingRow(input.onboardingId);
  const facts = await gatherFacts(row);
  const exceptions = await openExceptions(row.id);
  const gate = canCloseInvestment({
    stage: row.stage,
    requirements: facts.requirements,
    approvedToFundAt: row.approved_to_fund_at,
    countersignTiming: facts.countersignTiming,
    openBlockingExceptions: exceptions.filter((e) => e.severity === "blocking").length,
    fundingStatus: row.funding_status,
    fundingReconciled: isReconciledFunding(row.funding_status),
    acceptedAt: row.accepted_at,
    acceptedAmountCents: row.accepted_amount_cents,
  });
  if (!gate.allowed) fail(gate.reasons[0]!);

  const closingDate = input.closingDate ?? nowIso().slice(0, 10);
  const amount = Number(row.accepted_amount_cents);

  let positionId = row.position_id as string | null;
  if (!positionId) {
    const { data: existing } = await db()
      .from("investor_positions")
      .select("id")
      .eq("offering_id", row.offering_id)
      .eq("investment_profile_id", row.investment_profile_id)
      .maybeSingle();
    if (existing?.id) positionId = existing.id as string;
  }
  if (!positionId) {
    const { data: position, error } = await db()
      .from("investor_positions")
      .insert({
        offering_id: row.offering_id,
        investor_user_id: row.investor_user_id,
        investment_profile_id: row.investment_profile_id,
        person_id: row.person_id,
        application_id: row.application_id,
        display_name: facts.profile?.display_label ?? "Investor",
        capacity: facts.isEntity ? "entity" : "individual",
        status: "active",
        admitted_on: closingDate,
        created_by: actor.userId,
      })
      .select("id")
      .single();
    if (error) fail(error.message);
    positionId = position.id as string;
  }

  const dedupe = `onboarding:${row.id}:commitment`;
  const { data: already } = await db()
    .from("commitment_events")
    .select("id")
    .eq("dedupe_key", dedupe)
    .maybeSingle();
  if (!already) {
    await db().from("commitment_events").insert([
      {
        position_id: positionId,
        offering_id: row.offering_id,
        event_type: "commitment",
        amount_cents: amount,
        effective_date: closingDate,
        source: "investor_onboarding",
        source_ref: row.id,
        dedupe_key: dedupe,
        recorded_by: actor.userId,
      },
      {
        position_id: positionId,
        offering_id: row.offering_id,
        event_type: "contribution",
        amount_cents: Number(row.funded_amount_cents),
        effective_date: closingDate,
        source: "investor_onboarding",
        source_ref: row.id,
        dedupe_key: `onboarding:${row.id}:contribution`,
        recorded_by: actor.userId,
      },
    ]);
  }

  await touch(row.id, {
    stage: "closed",
    position_id: positionId,
    closed_amount_cents: amount,
    closed_by: actor.userId,
    closed_at: nowIso(),
  });
  await recordEvent({
    onboardingId: row.id,
    offeringId: row.offering_id,
    event: "investment_closed",
    toStatus: "closed",
    subjectTable: "investor_positions",
    subjectId: positionId,
    detail: { closedAmountCents: amount, closingDate },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  await syncInvitation(row);
  return { closed: true, positionId };
}

// ------------------------------------------------------- manager view

export async function managerOnboardingBoard(userId: string, offeringId?: string | null) {
  const actor = await onboardingActor(userId);
  const allowed = actor.isStaff
    ? offeringId
      ? [offeringId]
      : null
    : actor.managedOfferingIds.filter((id) => !offeringId || id === offeringId);
  if (!actor.isStaff && (!allowed || allowed.length === 0)) forbid("you do not manage that fund.");

  let query = db().from("investor_onboardings").select("*").order("last_activity_at", { ascending: false });
  if (allowed) query = query.in("offering_id", allowed);
  const { data } = await query;
  const rows = (data ?? []) as any[];

  const investorIds = [...new Set(rows.map((r) => r.investor_user_id).filter(Boolean))];
  const personIds = [...new Set(rows.filter((r) => !r.investor_user_id && r.person_id).map((r) => r.person_id))];
  const { data: prepared } = personIds.length
    ? await db().from("persons").select("id, legal_first_name, legal_last_name").in("id", personIds)
    : { data: [] as any[] };
  const byPerson = new Map(((prepared ?? []) as any[]).map((p) => [p.id, `${p.legal_first_name ?? ""} ${p.legal_last_name ?? ""}`.trim()]));
  const { data: people } = investorIds.length
    ? await db().from("profiles").select("user_id, legal_name, email").in("user_id", investorIds)
    : { data: [] as any[] };
  const byUser = new Map(((people ?? []) as any[]).map((p) => [p.user_id, p]));

  const items = [] as any[];
  for (const row of rows) {
    const facts = await gatherFacts(row);
    items.push(
      managerSafeView({
        id: row.id,
        offeringId: row.offering_id,
        investorName: byUser.get(row.investor_user_id)?.legal_name ?? byPerson.get(row.person_id) ?? "Investor",
        profileLabel: facts.profile?.display_label ?? null,
        profileType: facts.profile?.profile_type ?? null,
        requestedAmountCents: row.requested_amount_cents,
        acceptedAmountCents: row.accepted_amount_cents,
        stage: row.stage,
        status: managerInvestorStatus({
          stage: row.stage,
          fundingStatus: row.funding_status,
          approvedToFund: Boolean(row.approved_to_fund_at),
          investorReportsSent: Boolean(row.investor_reports_sent_at),
          acceptedAt: row.accepted_at,
        }),
        fundingStatus: row.funding_status,
        fundingLabel: managerFundingLabel({
          approvedToFund: Boolean(row.approved_to_fund_at),
          instructionsReleased: true,
          fundingStatus: row.funding_status,
          investorReportsSent: Boolean(row.investor_reports_sent_at),
        }),
        taxLabel: managerTaxLabel(facts.requirements.find((r: RequirementResult) => r.key === "tax_documentation")?.state ?? "missing"),
        complianceLabel: managerComplianceLabel(facts.requirements.find((r: RequirementResult) => r.key === "bad_actor")?.state ?? "not_applicable"),
        acceptedAt: row.accepted_at,
        closedAt: row.closed_at,
        // High-level only: no provider data, no identifiers, no tax records.
        progress: facts.requirements.map((r: RequirementResult) => ({
          key: r.key,
          label: r.label,
          state: r.state,
        })),
      }),
    );
  }
  // Invitations nobody has opened yet - shown as "Invited", never as progress.
  let invQuery = db()
    .from("fund_invitations")
    .select("id, offering_id, email, invited_name, intended_amount_cents, status, onboarding_status, created_at")
    .eq("invite_role", "investor")
    .eq("onboarding_status", "invited")
    .order("created_at", { ascending: false });
  if (allowed) invQuery = invQuery.in("offering_id", allowed);
  const { data: invites } = await invQuery;
  const invited = ((invites ?? []) as any[])
    .filter((i) => !["revoked", "cancelled", "expired"].includes(String(i.status)))
    .map((i) => ({
      id: `invite:${i.id}`,
      offeringId: i.offering_id,
      investorName: i.invited_name ?? i.email,
      profileLabel: null,
      requestedAmountCents: i.intended_amount_cents,
      acceptedAmountCents: null,
      stage: null,
      status: "Invited" as const,
      progress: [],
    }));
  return { items: [...invited, ...items] };
}

// ------------------------------------------------------- invitations

export async function inviteInvestor(
  userId: string,
  input: {
    offeringId: string;
    email: string;
    name?: string | null;
    intendedAmountCents?: number | null;
    source?: string | null;
    expiresInDays?: number;
  },
) {
  const actor = await onboardingActor(userId);
  if (!actor.isStaff && !actor.managedOfferingIds.includes(input.offeringId)) {
    forbid("you do not manage that fund.");
  }
  const { offering: invitedOffering } = await launchedOffering(input.offeringId);
  if (input.intendedAmountCents != null && input.intendedAmountCents <= 0) fail("Enter the investment amount.");

  const token = crypto.randomUUID().replace(/-/g, "");
  const expires = new Date(Date.now() + (input.expiresInDays ?? 30) * 86_400_000).toISOString();
  const { data, error } = await db()
    .from("fund_invitations")
    .insert({
      offering_id: input.offeringId,
      email: input.email.trim().toLowerCase(),
      invited_name: input.name ?? null,
      invited_by: actor.userId,
      token,
      expires_at: expires,
      status: "pending",
      onboarding_status: "invited",
      intended_amount_cents: input.intendedAmountCents ?? null,
      invitation_source: input.source ?? (actor.isStaff ? "harmonious" : "manager"),
      invite_role: "investor",
      role: "investor",
    })
    .select("*")
    .single();
  if (error) fail(error.message);

  await recordEvent({
    onboardingId: null,
    offeringId: input.offeringId,
    event: "investor_invited",
    subjectTable: "fund_invitations",
    subjectId: data.id,
    detail: { email: data.email, intendedAmountCents: input.intendedAmountCents ?? null },
    actorUserId: actor.userId,
    actorRole: actor.isStaff ? "harmonious" : "manager",
  });
  return {
    invitationId: data.id as string,
    token: data.token as string,
    // Derived from the offering's configuration - never chosen at invite time.
    exemption: ((invitedOffering as any).reg_type ?? null) as string | null,
    link: `/onboard/${data.token}`,
    emailSent: await sendOnboardInvitationEmail(data, invitedOffering, actor.userId),
  };
}

/**
 * The one onboarding email. Only the opaque invitation reference travels in
 * the link: never KYC, profile, bank or document identifiers.
 */
export async function sendOnboardInvitationEmail(invitation: any, offering: any, actorUserId: string, log?: { onboardingId: string }) {
  try {
    const { onboardInvitationUrl } = await import("@/lib/onboard-portal-model");
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const { data: manager } = await db()
      .from("profiles")
      .select("legal_name")
      .eq("user_id", actorUserId)
      .maybeSingle();
    const result = await sendTemplateEmail("investment-onboarding", invitation.email, {
      templateData: {
        investorName: invitation.invited_name || "",
        fundName: offering?.name ?? "the fund",
        managerName: (manager as any)?.legal_name ?? offering?.name ?? "Your fund manager",
        amountCents: invitation.intended_amount_cents ?? null,
        ctaUrl: onboardInvitationUrl(String(invitation.token)),
      },
    });
    await db().from("fund_invitations").update({ last_sent_at: nowIso() }).eq("id", invitation.id);
    if (log) {
      const { logInvestorEmail } = await import("@/lib/investor-emails.server");
      await logInvestorEmail({ onboardingId: log.onboardingId, offeringId: invitation.offering_id, kind: "invitation", subject: `Complete your investment onboarding for ${offering?.name ?? "the fund"}`, recipient: invitation.email, messageId: (result as any)?.messageId ?? null, sentBy: actorUserId });
    }
    return Boolean((result as any)?.sent);
  } catch (e) {
    console.error("[onboard] invitation email failed", (e as Error).message);
    if (log) {
      const { logInvestorEmail } = await import("@/lib/investor-emails.server");
      await logInvestorEmail({ onboardingId: log.onboardingId, offeringId: invitation.offering_id, kind: "invitation", recipient: invitation.email, sentBy: actorUserId, outcome: "failed", note: (e as Error).message.slice(0, 300) });
    }
    return false;
  }
}

/** Manager/staff resend of an investment onboarding invitation. */
export async function resendOnboardInvitation(userId: string, invitationId: string) {
  const actor = await onboardingActor(userId);
  const { data: inv } = await db().from("fund_invitations").select("*").eq("id", invitationId).maybeSingle();
  if (!inv) fail("That invitation was not found.");
  if (!actor.isStaff && !actor.managedOfferingIds.includes(inv.offering_id)) forbid("you do not manage that fund.");
  const problem = invitationUsableError(inv, nowIso());
  if (problem) fail(problem);
  const { data: offering } = await db().from("offerings").select("id, name").eq("id", inv.offering_id).maybeSingle();
  const sent = await sendOnboardInvitationEmail(inv, offering, actor.userId);
  await recordEvent({
    onboardingId: null,
    offeringId: inv.offering_id,
    event: "investor_invitation_resent",
    subjectTable: "fund_invitations",
    subjectId: inv.id,
    actorUserId: actor.userId,
    actorRole: actor.isStaff ? "harmonious" : "manager",
  });
  return { sent };
}

// ------------------------------------------- onboard.harmonious.co portal

/**
 * Claim (or resume) the investment behind an opaque invitation reference.
 * The reference is never a bearer credential: the caller must be signed in
 * with a VERIFIED email equal to the invitation email, and an invitation
 * already bound to another person can never be taken over.
 */
export async function claimOnboardInvitation(userId: string, reference: string) {
  if (!/^[A-Za-z0-9]{16,64}$/.test(reference)) fail("That invitation was not found.");
  const { data: inv } = await db().from("fund_invitations").select("*").eq("token", reference).maybeSingle();
  const problem = invitationUsableError(inv, nowIso());
  if (problem) fail(problem);
  if (String(inv.invite_role ?? inv.role ?? "investor") !== "investor") fail("That invitation was not found.");
  const { data: me } = await db().auth.admin.getUserById(userId);
  if (!me?.user?.email_confirmed_at) fail("Please verify your email address first.");
  if (!inv.email) fail("That invitation was not found.");
  const wrong = invitationRecipientError(inv.email, me.user.email ?? null);
  if (wrong) fail(wrong);
  try {
    const { claimPreparedRecords } = await import("@/lib/investor-record.server");
    await claimPreparedRecords(userId);
  } catch (e) {
    console.error("[onboard] prepared-record claim skipped", (e as Error).message);
  }
  const { data: bound } = await db()
    .from("investor_onboardings")
    .select("id, investor_user_id, person_id, offering_id, removed_at, persons(user_id, email)")
    .eq("invitation_id", inv.id)
    .limit(5);
  const others = ((bound ?? []) as any[]).filter((b) => b.investor_user_id && b.investor_user_id !== userId);
  if (others.length) fail("This invitation has already been used.");
  const mine = ((bound ?? []) as any[]).find((b) => b.investor_user_id === userId);
  if (mine) {
    // Already connected: close out the invitation so it never looks separated.
    if (inv.status === "pending") await db().from("fund_invitations").update({ status: "accepted", accepted_at: nowIso(), accepted_by: userId }).eq("id", inv.id).eq("status", "pending");
    await db().from("investor_fund_access").upsert({ user_id: userId, offering_id: mine.offering_id, granted_by: inv.invited_by }, { onConflict: "user_id,offering_id" });
    await db().from("user_roles").upsert({ user_id: userId, role: "investor" }, { onConflict: "user_id,role" });
    return { onboardingId: mine.id as string };
  }
  // A manager-added investment tied to this exact invitation: connect it to the
  // invited (email-verified) account directly, never create a second investment.
  const prepared = ((bound ?? []) as any[]).find((b) => !b.investor_user_id && !b.removed_at);
  if (prepared) {
    const { canLinkPreparedInvestment } = await import("@/lib/investor-onboarding-model");
    if (!canLinkPreparedInvestment({ personUserId: prepared.persons?.user_id ?? null, personEmail: prepared.persons?.email ?? null }, { userId, email: me.user.email ?? null })) {
      fail("We need to verify your existing investment record before you continue. Harmonious has been notified. You don't need to create another investment.");
    }
    const { error: linkErr } = await db().from("investor_onboardings").update({ investor_user_id: userId, last_activity_at: nowIso() }).eq("id", prepared.id).is("investor_user_id", null);
    if (linkErr) fail(linkErr.message);
    if (prepared.person_id && !prepared.persons?.user_id) await db().from("persons").update({ user_id: userId }).eq("id", prepared.person_id).is("user_id", null);
    await db().from("investor_fund_access").upsert({ user_id: userId, offering_id: prepared.offering_id, granted_by: inv.invited_by }, { onConflict: "user_id,offering_id" });
    await db().from("user_roles").upsert({ user_id: userId, role: "investor" }, { onConflict: "user_id,role" });
    if (inv.status === "pending") await db().from("fund_invitations").update({ status: "accepted", accepted_at: nowIso(), accepted_by: userId, onboarding_status: "account_created" }).eq("id", inv.id);
    await recordEvent({ onboardingId: prepared.id, offeringId: prepared.offering_id, event: "personal_link_claimed", subjectTable: "fund_invitations", subjectId: inv.id, actorUserId: userId, actorRole: "investor" });
    return { onboardingId: prepared.id as string };
  }
  const started = await startOnboarding(userId, { slugOrId: inv.offering_id, invitationToken: reference });
  if (!started.onboardingId) fail("We need to verify your existing investment record before you continue. Harmonious has been notified. You don't need to create another investment.");
  return { onboardingId: started.onboardingId };
}

function accreditationNeedsVerification(req: OfferingRequirements): boolean {
  if (!req.accreditationRequired) return false;
  const method = String(req.accreditationMethod ?? "").toLowerCase();
  return Boolean(method) && method !== "self_certification";
}

/** Presentation for one investment, derived only from authoritative records. */
export async function onboardPortalDetail(userId: string, onboardingId: string) {
  const { row } = await assertInvestorOwns(userId, onboardingId);
  const detail: any = await onboardingDetail(userId, onboardingId);
  const { portalSteps, portalResumeStep, portalComplete } = await import("@/lib/onboard-portal-model");
  const steps = portalSteps(detail.requirements ?? []);
  const accreditation = (detail.requirements ?? []).find((r: any) => r.key === "accreditation");
  return {
    onboardingId,
    fundName: detail.offering?.name ?? "Your investment",
    offeringId: detail.offering?.id ?? row.offering_id,
    amountCents: detail.acceptedAmountCents ?? detail.requestedAmountCents ?? null,
    profileLabel: detail.profileLabel ?? null,
    hasProfile: Boolean(detail.investmentProfileId),
    exemption: detail.exemption ?? null,
    // 506(c) or offering-configured independent verification: self-certification never satisfies it.
    accreditationVerified: accreditationNeedsVerification(await offeringRequirements(row.offering_id)),
    accreditationReason: accreditation?.reason ?? null,
    requirements: (detail.requirements ?? []).map((r: any) => ({ key: r.key, label: r.label, state: r.state, reason: r.reason ?? null })),
    documents: (detail.documents ?? []).map((d: any) => ({
      id: d.id,
      title: d.title,
      requiresSignature: Boolean(d.requiresSignature),
      signed: Boolean(d.signed),
    })),
    questionnaire: detail.questionnaire ?? null,
    questionnaireResponses: detail.questionnaireResponses ?? null,
    executed: Boolean(detail.executedSnapshot),
    fundingUnlocked: Boolean(detail.fundingUnlocked),
    fundingStatus: (detail.fundingStatus ?? null) as string | null,
    investorReportsSent: Boolean(detail.investorReportsSent),
    signing: await portalSigningStages(row),
    steps,
    resume: portalResumeStep(steps),
    complete: portalComplete(steps),
  };
}

// ------------------------------------------------ verification (Didit)

/**
 * Manager-added investments have no legacy application, which verification
 * sessions hang off. Create the one record (reusing any existing one) so
 * verification can start. Changes nothing about signatures, money or results.
 */
export async function ensureVerificationApplication(row: { id: string; investor_user_id: string | null; offering_id: string }): Promise<string | null> {
  if (!row.investor_user_id) return null;
  const find = async () => {
    const { data } = await db().from("investor_applications").select("id").eq("user_id", row.investor_user_id).eq("offering_id", row.offering_id).order("created_at", { ascending: true }).limit(1);
    return (((data ?? []) as any[])[0]?.id as string | undefined) ?? null;
  };
  let id = await find();
  if (!id) {
    const { data, error } = await db().from("investor_applications").insert({ user_id: row.investor_user_id, offering_id: row.offering_id, source: "admin", current_step: "verification" }).select("id").single();
    if (error) { console.error("ensureVerificationApplication", error); id = await find(); }
    else id = (data as any).id;
  }
  if (id) await db().from("investor_onboardings").update({ application_id: id }).eq("id", row.id).is("application_id", null);
  return id;
}

/**
 * Start (or resume) the existing Didit verification session for the
 * application behind this investment. Same session, webhook and
 * reconciliation paths: no second verification system.
 */
/** True when the person's KYC and AML are both currently clear (same rule the readiness engine uses). */
async function personCleared(personId: string | null) {
  if (!personId) return false;
  const { reuseState } = await import("@/lib/investor-onboarding-model");
  const { data: p } = await db().from("persons").select("kyc_status, reverification_due_at, aml_status").eq("id", personId).maybeSingle();
  if (!p) return false;
  const now = nowIso();
  return reuseState((p as any).kyc_status, (p as any).reverification_due_at, now) === "valid" && reuseState((p as any).aml_status, null, now) === "valid";
}

/**
 * Reuses an identity check the investor already cleared (account check or an earlier investment).
 * The provider's decision is re-read before anything is applied — a stored "approved" alone never clears a step.
 */
export async function reusePriorVerification(row: any, actorUserId: string | null) {
  if (!row.person_id) return false;
  if (await personCleared(row.person_id)) return true;
  if (!row.investor_user_id) return false;
  let sessionId: string | null = null;
  const { data: acct } = await db().from("account_identity_checks").select("session_id").eq("user_id", row.investor_user_id).eq("status", "approved").not("session_id", "is", null).order("updated_at", { ascending: false }).limit(1);
  sessionId = ((acct ?? []) as any[])[0]?.session_id ?? null;
  if (!sessionId) {
    const { data: kv } = await db().from("kyc_verifications").select("session_id").eq("person_id", row.person_id).eq("status", "approved").not("session_id", "is", null).order("created_at", { ascending: false }).limit(1);
    sessionId = ((kv ?? []) as any[])[0]?.session_id ?? null;
  }
  if (!sessionId) return false;
  if (!row.questionnaire_didit_session_id) await touch(row.id, { questionnaire_didit_session_id: sessionId });
  const { autoApplyDiditForOnboarding } = await import("@/lib/didit-auto-apply.server");
  try { await autoApplyDiditForOnboarding(row.id, actorUserId); } catch (e) { console.error("[verify-reuse]", (e as Error).message); return false; }
  return personCleared(row.person_id);
}

export async function startInvestmentVerification(userId: string, onboardingId: string, origin: string, returnPath?: string | null) {
  const { row } = await assertInvestorOwns(userId, onboardingId);
  if (await reusePriorVerification(row, userId)) {
    if (["profile_selected", "verification"].includes(String(row.stage))) await touch(row.id, { stage: "verification" });
    await recordEvent({ onboardingId: row.id, offeringId: row.offering_id, event: "verification_reused", actorUserId: userId, actorRole: "investor" } as any);
    return { url: null as string | null, completed: true };
  }
  let applicationId = row.application_id as string | null;
  if (!applicationId) {
    const { data } = await db()
      .from("investor_applications")
      .select("id")
      .eq("user_id", row.investor_user_id)
      .eq("offering_id", row.offering_id)
      .order("created_at", { ascending: true })
      .limit(1);
    applicationId = ((data ?? []) as any[])[0]?.id ?? null;
    if (applicationId) await touch(row.id, { application_id: applicationId });
  }
  if (!applicationId && row.investor_user_id) applicationId = await ensureVerificationApplication(row);
  if (!applicationId) {
    const { notifyInvestorBlocked } = await import("@/lib/investor-blocked-notify.server");
    await notifyInvestorBlocked({ onboardingId: row.id, offeringId: row.offering_id, investorUserId: row.investor_user_id ?? null, step: "Verification" });
    fail("We couldn't start verification. Harmonious has been notified and will follow up. Please try again shortly.");
  }
  const { startVerificationSession } = await import("@/lib/kyc-verification.server");
  const result = await startVerificationSession({ applicationId, userId: row.investor_user_id, origin, ...(returnPath ? { returnPath } : {}) });
  if (String(row.stage) === "profile_selected") await touch(row.id, { stage: "verification" });
  await recordEvent({
    onboardingId: row.id,
    offeringId: row.offering_id,
    event: "verification_started",
    actorUserId: userId,
    actorRole: "investor",
  });
  return { url: result.url as string };
}


// ------------------------------------ dual signature + secure wire reveal

/** Provider-derived signing stage per document for one investment. */
async function portalSigningStages(row: any) {
  const { signingStage } = await import("@/lib/fund-onboarding-model");
  if (!row.application_id) return [] as { documentId: string; mode: string; stage: string }[];
  const { data: docs } = await db()
    .from("offering_documents")
    .select("id, signing_mode, requires_signature")
    .eq("offering_id", row.offering_id);
  const { data: sigs } = await db()
    .from("document_signatures")
    .select("id, offering_document_id, provider_status")
    .eq("application_id", row.application_id);
  const { data: signers } = await db()
    .from("document_signature_signers")
    .select("signature_id, role_key, signing_order, status")
    .eq("application_id", row.application_id);
  return ((docs ?? []) as any[])
    .filter((d) => d.requires_signature)
    .map((d) => {
      const sig = ((sigs ?? []) as any[]).find((s) => s.offering_document_id === d.id);
      const mine = ((signers ?? []) as any[]).filter((s) => sig && s.signature_id === sig.id);
      return {
        documentId: d.id as string,
        mode: (d.signing_mode ?? "investor_only") as string,
        stage: signingStage({
          mode: (d.signing_mode ?? "investor_only") as any,
          providerStatus: sig?.provider_status ?? null,
          signers: mine.map((s) => ({
            role: s.role_key === "fund_manager" ? "fund_manager" : "investor",
            order: Number(s.signing_order ?? 1),
            status: String(s.status ?? ""),
          })),
        }),
      };
    });
}

/**
 * Reveal the released wire instructions for one investment. Requires a fresh
 * sign-in (checked from the verified token, never the URL), is tied to the
 * caller, the investment and the current released instruction version, and
 * is audited every time.
 */
export async function revealWireInstructions(userId: string, onboardingId: string, claims: unknown) {
  const { isFreshAuth } = await import("@/lib/fund-onboarding-model");
  const { row } = await assertInvestorOwns(userId, onboardingId);
  if (!isFreshAuth(claims, Math.floor(Date.now() / 1000))) {
    return { status: "reauth_required" as const, instructions: null, reasons: [] as string[] };
  }
  const result = await fundingInstructions(userId, onboardingId);
  if (!result.unlocked || !result.instructions) {
    return { status: "not_ready" as const, instructions: null, reasons: result.reasons };
  }
  const { data: setup } = await db().from("fund_setups").select("id").eq("offering_id", row.offering_id).maybeSingle();
  const { data: banking } = setup?.id
    ? await db().from("fund_banking_setups").select("id, updated_at").eq("setup_id", setup.id).maybeSingle()
    : { data: null };
  const version = String((banking as any)?.updated_at ?? "");
  await recordEvent({
    onboardingId: row.id,
    offeringId: row.offering_id,
    event: "wire_instructions_revealed",
    actorUserId: userId,
    actorRole: "investor",
    detail: { instruction_version: version, banking_setup_id: (banking as any)?.id ?? null },
  } as any);
  const { data: profile } = row.investment_profile_id
    ? await db().from("investment_profiles").select("display_label").eq("id", row.investment_profile_id).maybeSingle()
    : { data: null };
  return {
    status: "revealed" as const,
    reasons: [] as string[],
    instructionVersion: version,
    investingAs: ((profile as any)?.display_label ?? null) as string | null,
    instructions: result.instructions,
  };
}

// ------------------------------------------------ investment readiness

/** Read-only: compute the canonical readiness projection. Never writes anything. */
async function confirmedPrior(onboardingId: string) {
  const { confirmedPriorSubscription } = await import("@/lib/prior-subscription.server");
  const p = await confirmedPriorSubscription(onboardingId);
  return p ? { fundedCents: p.funded_cents, signedOn: p.signed_on } : null;
}

/** Saves the dashboard summary for one onboarding (derived cache; failures never block the caller). */
export async function saveReadinessSummary(row: any, result: any) {
  await db().from("onboarding_readiness_summaries").upsert({
    onboarding_id: row.id, offering_id: row.offering_id, close_ready: !!result.closeReady, terminal: result.terminal ?? null,
    blocked: result.items.some((i: any) => i.status === "blocked"), next_owner: result.nextAction?.owner ?? null, computed_at: nowIso(),
  }).then(() => null, () => null);
}

export async function computeReadinessFor(row: any, closeAmountCents?: number | null, inputs?: ReadinessInputs) {
  const { computeReadiness } = await import("@/lib/investment-readiness");
  const I = inputs ?? (await loadReadinessInputs([row]));
  const facts = await gatherFacts(row, I);
  const exceptions = I.exceptions.get(String(row.id)) ?? [];
  const prior = I.priors.get(String(row.id));
  const confirmed = prior?.decision?.decision === "confirmed" ? prior : null;
  const result = computeReadiness({
    requirements: facts.requirements,
    stage: String(row.stage ?? ""),
    fundingStatus: row.funding_status ?? null,
    approvedToFundAt: row.approved_to_fund_at ?? null,
    acceptedAt: row.accepted_at ?? null,
    acceptedAmountCents: row.accepted_amount_cents ?? null,
    closedAt: row.closed_at ?? null,
    exceptions: exceptions.map((e) => ({ severity: String(e.severity), owner: e.owner ?? null, type: e.exception_type ?? null })),
    requestedCloseDate: row.requested_close_date ?? null,
    closeAmountCents: closeAmountCents ?? null,
    priorSubscription: confirmed ? { fundedCents: confirmed.funded_cents, signedOn: confirmed.signed_on } : null,
    outsideSubscription: (() => { const o = I.outside?.get(String(row.id)); return o?.complete && o.signedOn ? { signedOn: o.signedOn } : null; })(),
  });
  return { result, facts };
}

/** Read-only batch: one load for all rows, then the same per-row compute as computeReadinessFor. */
export async function readinessForMany(rows: any[]) {
  if (!rows.length) return [] as Awaited<ReturnType<typeof computeReadinessFor>>[];
  const I = await loadReadinessInputs(rows);
  const out: Awaited<ReturnType<typeof computeReadinessFor>>[] = [];
  for (const row of rows) out.push(await computeReadinessFor(row, null, I));
  return out;
}

/**
 * reconcileInvestmentReadiness - the one canonical, idempotent reconciliation.
 * Called after a canonical record changes (mutation completion, provider webhook,
 * or an explicitly authorized staff reconciliation) - never by rendering a page.
 * Writes only readiness history (real transitions) and work items.
 */
export async function reconcileInvestmentReadiness(onboardingId: string, ctx: { actorUserId: string | null; trigger: string }) {
  const { readinessTransitions, readinessTaskPlan, READINESS_RULE_VERSION } = await import("@/lib/investment-readiness");
  const row = await onboardingRow(onboardingId);
  const { result, facts } = await computeReadinessFor(row);
  await saveReadinessSummary(row, result);
  const [{ data: evs }, { data: tasks }] = await Promise.all([
    db().from("investment_readiness_events").select("requirement_key,new_status,created_at").eq("onboarding_id", row.id).order("created_at", { ascending: true }),
    db().from("investment_readiness_tasks").select("id,requirement_key").eq("onboarding_id", row.id).eq("status", "open"),
  ]);
  const prev: Record<string, string> = {};
  for (const e of (evs ?? []) as any[]) prev[e.requirement_key] = e.new_status;
  const initial = !(evs ?? []).length;
  const transitions = readinessTransitions(prev, result);
  const at = nowIso();
  if (transitions.length) {
    await db().from("investment_readiness_events").insert(transitions.map((t) => ({
      onboarding_id: row.id,
      offering_id: row.offering_id,
      investment_profile_id: row.investment_profile_id ?? null,
      requirement_key: t.key,
      stage: t.stage,
      previous_status: t.from,
      new_status: t.to,
      source_system: t.source,
      reason: initial ? `Initialization (${ctx.trigger})` : `Canonical record changed (${ctx.trigger})`,
      changed_by: ctx.actorUserId,
      automatic: true,
      rule_version: READINESS_RULE_VERSION,
      created_at: at,
    })));
  }
  const open = new Map(((tasks ?? []) as any[]).map((t) => [t.requirement_key, t.id]));
  const plan = readinessTaskPlan(new Set(open.keys()), result);
  if (plan.create.length) {
    // Partial unique index makes a concurrent/duplicate reconciliation a no-op.
    // The partial unique index (one open item per requirement) turns a concurrent or
    // duplicate reconciliation into a no-op; insert one by one so duplicates are ignored.
    for (const c of plan.create) {
      await db().from("investment_readiness_tasks").insert({ onboarding_id: row.id, offering_id: row.offering_id, requirement_key: c.key, title: c.title, owner: c.owner, rule_version: READINESS_RULE_VERSION, became_actionable_at: at });
    }
  }
  for (const k of plan.resolve) {
    await db().from("investment_readiness_tasks").update({ status: "resolved", resolved_at: at }).eq("id", open.get(k));
  }
  try {
    const { captureProgress } = await import("@/lib/investor-progress-email.server");
    await captureProgress(row, journeySteps(facts.requirements, {
      stage: row.stage, approvedToFund: Boolean(row.approved_to_fund_at),
      fundingStatus: row.funding_status, investorReportsSent: Boolean(row.investor_reports_sent_at),
    }), initial);
  } catch (e) { console.error("[investor-progress] capture failed", e); }
  return { result, transitions: transitions.length, created: plan.create.length, resolved: plan.resolve.length };
}

/** Best-effort reconciliation after a successful mutation; never fails the mutation. */
export async function reconcileAfter(onboardingIds: (string | null | undefined)[], ctx: { actorUserId: string | null; trigger: string }) {
  for (const id of [...new Set(onboardingIds.filter(Boolean) as string[])]) {
    try { await reconcileInvestmentReadiness(id, ctx); } catch (e) { console.error("[readiness] reconcile failed", ctx.trigger, e instanceof Error ? e.message : e); }
  }
}

/** Provider-change entry point: resolve affected investments by application / profile / investor. */
export async function reconcileReadinessForSubjects(subject: { applicationId?: string | null; investmentProfileId?: string | null; investorUserId?: string | null }, trigger: string) {
  const ors: string[] = [];
  if (subject.applicationId) ors.push(`application_id.eq.${subject.applicationId}`);
  if (subject.investmentProfileId) ors.push(`investment_profile_id.eq.${subject.investmentProfileId}`);
  if (subject.investorUserId) ors.push(`investor_user_id.eq.${subject.investorUserId}`);
  if (!ors.length) return;
  const { data } = await db().from("investor_onboardings").select("id").or(ors.join(",")).not("stage", "in", "(declined,cancelled)");
  await reconcileAfter(((data ?? []) as any[]).map((r) => r.id), { actorUserId: null, trigger });
}

export async function reconcileForException(exceptionId: string, userId: string) {
  const { data } = await db().from("investor_onboarding_exceptions").select("onboarding_id").eq("id", exceptionId).maybeSingle();
  await reconcileAfter([(data as any)?.onboarding_id], { actorUserId: userId, trigger: "resolveException" });
}

/** Explicitly authorized, audited staff reconciliation for one investment (no production-wide backfill). */
export async function staffReconcileReadiness(userId: string, onboardingId: string) {
  await assertStaff(userId);
  const r = await reconcileInvestmentReadiness(onboardingId, { actorUserId: userId, trigger: "staff_reconciliation" });
  return { transitions: r.transitions, created: r.created, resolved: r.resolved };
}

/** Investors follow their four steps; readiness is a staff/manager view. */
export function readinessViewerAllowed(role: Access["role"]) {
  return role !== "investor";
}

export async function investmentReadiness(userId: string, onboardingId: string) {
  const { readinessView } = await import("@/lib/investment-readiness");
  const access = await assertOnboardingAccess(userId, onboardingId);
  if (!readinessViewerAllowed(access.role)) forbid("readiness is shown only to Harmonious and fund managers.");
  const { result, facts } = await computeReadinessFor(access.row);
  const { data: offering } = await db().from("offerings").select("name").eq("id", access.row.offering_id).maybeSingle();
  return {
    onboardingId,
    fundName: offering?.name ?? "Fund",
    profileLabel: facts.profile?.display_label ?? null,
    amountCents: access.row.accepted_amount_cents ?? access.row.requested_amount_cents ?? null,
    viewer: access.role,
    readiness: readinessView(result, access.role),
  };
}

export async function fundReadiness(userId: string, offeringId: string, viewerOverride?: "manager") {
  const { readinessView } = await import("@/lib/investment-readiness");
  const actor = await onboardingActor(userId);
  if (!actor.isStaff && !actor.managedOfferingIds.includes(offeringId)) forbid("you do not manage that fund.");
  // Staff may render the narrower manager view (View As preview); never the reverse.
  const viewer = viewerOverride === "manager" || !actor.isStaff ? "manager" : "staff";
  const { data } = await db().from("investor_onboardings").select("*").eq("offering_id", offeringId).not("stage", "in", "(declined,cancelled)");
  const rows = (data ?? []) as any[];
  const ids = [...new Set(rows.map((r) => r.investor_user_id))];
  const { data: people } = ids.length ? await db().from("profiles").select("user_id, legal_name").in("user_id", ids) : { data: [] as any[] };
  const names = new Map(((people ?? []) as any[]).map((p) => [p.user_id, p.legal_name]));
  const out = [] as any[];
  for (const row of rows) {
    const { result, facts } = await computeReadinessFor(row);
    const v = readinessView(result, viewer);
    out.push({
      onboardingId: row.id,
      investorName: names.get(row.investor_user_id) ?? "Investor",
      profileLabel: facts.profile?.display_label ?? null,
      profileType: facts.profile?.profile_type ?? null,
      amountCents: row.accepted_amount_cents ?? row.requested_amount_cents ?? null,
      percentComplete: v.percentComplete,
      nextAction: v.nextAction,
      closeReady: v.closeReady,
      updatedAt: row.updated_at ?? null,
      readiness: v,
    });
  }
  return { viewer, rows: out };
}

/** Canonical per-investment readiness for a Close Request selector (read-only). */
export async function closeReadinessFor(userId: string, onboardingId: string, closeAmountCents: number) {
  const { readinessView } = await import("@/lib/investment-readiness");
  const access = await assertOnboardingAccess(userId, onboardingId);
  if (access.role === "investor") forbid("close readiness is a fund view.");
  const { result } = await computeReadinessFor(access.row, closeAmountCents);
  return readinessView(result, access.role);
}

export async function readinessQueue(userId: string) {
  await assertStaff(userId);
  const { data } = await db().from("investment_readiness_tasks").select("*").eq("status", "open").order("created_at", { ascending: true }).limit(500);
  const tasks = (data ?? []) as any[];
  const offIds = [...new Set(tasks.map((t) => t.offering_id).filter(Boolean))];
  const onbIds = [...new Set(tasks.map((t) => t.onboarding_id))];
  const [{ data: offs }, { data: onbs }] = await Promise.all([
    offIds.length ? db().from("offerings").select("id,name").in("id", offIds) : { data: [] },
    onbIds.length ? db().from("investor_onboardings").select("id,investor_user_id,stage").in("id", onbIds) : { data: [] },
  ]);
  const uids = [...new Set(((onbs ?? []) as any[]).map((o) => o.investor_user_id))];
  const { data: people } = uids.length ? await db().from("profiles").select("user_id, legal_name").in("user_id", uids) : { data: [] as any[] };
  const fund = new Map(((offs ?? []) as any[]).map((o) => [o.id, o.name]));
  const onb = new Map(((onbs ?? []) as any[]).map((o) => [o.id, o]));
  const who = new Map(((people ?? []) as any[]).map((p) => [p.user_id, p.legal_name]));
  const now = Date.now();
  return tasks.map((t) => ({
    id: t.id,
    onboardingId: t.onboarding_id,
    offeringId: t.offering_id,
    fundName: fund.get(t.offering_id) ?? "Fund",
    investorName: who.get(onb.get(t.onboarding_id)?.investor_user_id) ?? "Investor",
    title: t.title,
    owner: t.owner,
    stage: onb.get(t.onboarding_id)?.stage ?? null,
    ageDays: Math.floor((now - new Date(t.became_actionable_at ?? t.created_at).getTime()) / 86400000),
  }));
}

/* ------------------------------------------------ personal investment links */
// Each investor's own link is the existing email-bound invitation (/onboard/<token>), attached to
// their investment so claiming it opens that exact investment. Creating one never sends email.
async function personalLinkRow(onboardingId: string) {
  const { data: row } = await db().from("investor_onboardings").select("id, offering_id, invitation_id, investor_user_id, person_id, requested_amount_cents, removed_at, persons(email, legal_first_name, legal_last_name)").eq("id", onboardingId).maybeSingle();
  if (!row || row.removed_at) fail("That investor record was not found.");
  return row as any;
}
async function linkView(row: any) {
  const { onboardInvitationUrl } = await import("@/lib/onboard-portal-model");
  if (!row.invitation_id) return null;
  const { data: inv } = await db().from("fund_invitations").select("id, token, status, expires_at, last_sent_at, accepted_at, created_at").eq("id", row.invitation_id).maybeSingle();
  if (!inv) return null;
  const expired = inv.expires_at && inv.expires_at < nowIso();
  return { url: onboardInvitationUrl(String(inv.token)), createdAt: inv.created_at, expiresAt: inv.expires_at, lastSentAt: inv.last_sent_at, claimed: Boolean(row.investor_user_id || inv.accepted_at), state: inv.status === "revoked" || inv.status === "disabled" ? "disabled" : expired ? "expired" : row.investor_user_id || inv.accepted_at ? "claimed" : "active" };
}
async function managerOrStaff(userId: string, offeringId: string) {
  const actor = await onboardingActor(userId);
  if (!actor.isStaff && !actor.managedOfferingIds.includes(offeringId)) forbid("you do not manage that fund.");
  return actor;
}
export async function getPersonalLink(userId: string, onboardingId: string) {
  const row = await personalLinkRow(onboardingId);
  const actor = await onboardingActor(userId);
  const isInvestor = row.investor_user_id === userId;
  if (!isInvestor && !actor.isStaff && !actor.managedOfferingIds.includes(row.offering_id)) forbid("you do not have access to that investor.");
  const { data: setup } = await db().from("fund_setups").select("launch_state, launched_at").eq("offering_id", row.offering_id).maybeSingle();
  const launched = Boolean(setup?.launched_at);
  const link = await linkView(row);
  const { personalLinkPermissions } = await import("@/lib/personal-investment-link-model");
  const perms = personalLinkPermissions({ isInvestor, hasLink: Boolean(link), linkActive: link?.state === "active", hasEmail: Boolean(row.persons?.email) });
  return { link, launched, hasEmail: Boolean(row.persons?.email), canCreate: perms.canCreate, canSend: perms.canSend };
}
export async function createPersonalLink(userId: string, onboardingId: string) {
  const row = await personalLinkRow(onboardingId);
  const actor = await managerOrStaff(userId, row.offering_id);
  if (row.invitation_id) fail("This investor already has a personal link. Harmonious can replace it if needed.");
  const email = String(row.persons?.email ?? "").trim().toLowerCase();
  if (!email) fail("Add the investor's email first.");
  const name = `${row.persons?.legal_first_name ?? ""} ${row.persons?.legal_last_name ?? ""}`.trim() || null;
  const { data: inv, error } = await db().from("fund_invitations").insert({
    offering_id: row.offering_id, email, invited_name: name, invited_by: actor.userId, token: crypto.randomUUID().replace(/-/g, ""),
    expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), status: "pending", onboarding_status: "invited",
    intended_amount_cents: row.requested_amount_cents ?? null, invitation_source: actor.isStaff ? "harmonious:personal_link" : "manager:personal_link", invite_role: "investor", role: "investor",
  }).select("*").single();
  if (error) fail(error.message);
  const { error: linkErr } = await db().from("investor_onboardings").update({ invitation_id: inv.id }).eq("id", onboardingId).is("invitation_id", null);
  if (linkErr) fail(linkErr.message);
  await recordEvent({ onboardingId, offeringId: row.offering_id, event: "personal_link_created", subjectTable: "fund_invitations", subjectId: inv.id, detail: { emailSent: false }, actorUserId: actor.userId, actorRole: actor.isStaff ? "harmonious" : "manager" });
  // If this person already has a verified account, connect it now.
  await (await import("@/lib/account-connect.server")).connectEmail(email);
  return { link: await linkView({ ...row, invitation_id: inv.id }) };
}
export async function sendPersonalLink(userId: string, onboardingId: string) {
  const row = await personalLinkRow(onboardingId);
  const actor = await managerOrStaff(userId, row.offering_id);
  if (!row.invitation_id) fail("Create the personal link first.");
  const { data: inv } = await db().from("fund_invitations").select("*").eq("id", row.invitation_id).maybeSingle();
  if (!inv || (inv.expires_at && inv.expires_at < nowIso())) fail("This link has expired. Ask Harmonious to replace it.");
  const { data: offering } = await db().from("offerings").select("*").eq("id", row.offering_id).maybeSingle();
  const sent = await sendOnboardInvitationEmail(inv, offering, actor.userId, { onboardingId });
  await recordEvent({ onboardingId, offeringId: row.offering_id, event: "personal_link_emailed", subjectTable: "fund_invitations", subjectId: inv.id, detail: { emailSent: sent }, actorUserId: actor.userId, actorRole: actor.isStaff ? "harmonious" : "manager" });
  return { emailSent: Boolean(sent) };
}
export async function recordPersonalLinkCopy(userId: string, onboardingId: string) {
  const row = await personalLinkRow(onboardingId);
  const actor = await onboardingActor(userId);
  const isInvestor = row.investor_user_id === userId;
  if (!isInvestor && !actor.isStaff && !actor.managedOfferingIds.includes(row.offering_id)) forbid("you do not have access to that investor.");
  await recordEvent({ onboardingId, offeringId: row.offering_id, event: "personal_link_copied", actorUserId: userId, actorRole: isInvestor ? "investor" : actor.isStaff ? "harmonious" : "manager" });
  return { ok: true };
}
/** Investor: only their own claimed investments. */
export async function myPersonalLinks(userId: string) {
  const { data: rows } = await db().from("investor_onboardings").select("id, offering_id, invitation_id, investor_user_id, offerings(name)").eq("investor_user_id", userId).is("removed_at", null);
  const { ONBOARD_ORIGIN } = await import("@/lib/onboard-portal-model");
  return { links: ((rows ?? []) as any[]).map((r) => ({ onboardingId: r.id as string, fundName: String(r.offerings?.name ?? "Fund"), url: `${ONBOARD_ORIGIN}/onboard/i/${r.id}` })) };
}

/**
 * Ask the fund's managers to countersign when the fund's timing says it's due.
 * parallel → after the investor signs; after_completion → when the investor reaches/finishes funding.
 * Sent once per investment (recorded event); never approves, admits or moves money.
 */
export async function requestCountersignIfDue(onboardingId: string, moment: "on_investor_signature" | "on_funding_step", actorUserId: string) {
  const row = await onboardingRow(onboardingId);
  if (row.approved_to_fund_at || row.removed_at) return { sent: false };
  const facts = await gatherFacts(row);
  const { countersignNoticeMoment } = await import("@/lib/countersign-timing");
  if (facts.countersignTiming === "pause" || countersignNoticeMoment(facts.countersignTiming) !== moment) return { sent: false };
  const { data: prior } = await db().from("investor_onboarding_events").select("id").eq("onboarding_id", row.id).eq("event", "countersign_requested").limit(1);
  if ((prior ?? []).length) return { sent: false };
  await recordEvent({ onboardingId: row.id, offeringId: row.offering_id, event: "countersign_requested", detail: { timing: facts.countersignTiming, moment }, actorUserId, actorRole: "system" });
  const { notifyFundManagers } = await import("@/lib/client-work-notify.server");
  await notifyFundManagers(row.offering_id, "approval_required", "Investor agreement countersignature", `/manager/fund/${row.offering_id}/investors`);
  return { sent: true };
}
