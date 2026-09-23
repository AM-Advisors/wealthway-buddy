/**
 * Fund Administration Phase B — server-only investor onboarding engine.
 *
 * This is an ORCHESTRATION layer. It owns no compliance truth of its own: it
 * reads the authoritative records already in the platform —
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
  if (access.role !== "investor") forbid("only the investor can complete their own onboarding.");
  if (["closed", "declined", "cancelled"].includes(String(access.row.stage))) {
    fail("This investment can no longer be changed.");
  }
  return access;
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
async function launchedOffering(offeringIdOrSlug: string) {
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

export async function offeringRequirements(offeringId: string): Promise<OfferingRequirements> {
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

  return applyExemption({
    accreditationRequired: Boolean(req?.accreditation_required ?? rules['accreditationRequired'] ?? false),
    accreditationMethod: (req?.accreditation_verification ?? rules['accreditationMethod'] ?? null) as string | null,
    qualifiedPurchaserRequired: Boolean(rules['qualifiedPurchaserRequired'] ?? false),
    kycRequired: Boolean(req?.requires_person_kyc ?? true),
    kybRequired: Boolean(req?.requires_entity_kyb ?? true),
    amlRequired: Boolean(req?.requires_person_aml ?? true),
    taxDocumentRequired: Boolean(rules['taxDocumentRequired'] ?? true),
    subscriptionQuestionnaireRequired: Boolean(rules['subscriptionQuestionnaireRequired'] ?? false),
    minInvestmentCents: Number(setup?.min_investment_cents ?? offering?.min_investment_cents ?? 0) || null,
    maxInvestmentCents: (rules['maxInvestmentCents'] as number | undefined) ?? null,
    remainingCapacityCents: null,
    permittedJurisdictions: (rules['permittedJurisdictions'] as string[] | undefined) ?? null,
    permittedProfileTypes: (rules['permittedProfileTypes'] as string[] | undefined) ?? null,
    foreignInvestorsPermitted: rules['foreignInvestorsPermitted'] !== false,
  }, (offering as any)?.reg_type ?? null);
}

// ------------------------------------------------------------ facts

async function gatherFacts(row: any) {
  const offering = await offeringRequirements(row.offering_id);

  const { data: person } = row.person_id
    ? await db().from("persons").select("*").eq("id", row.person_id).maybeSingle()
    : await db().from("persons").select("*").eq("user_id", row.investor_user_id).maybeSingle();

  let profile: any = null;
  let entity: any = null;
  let related: any[] = [];
  if (row.investment_profile_id) {
    const { data } = await db()
      .from("investment_profiles")
      .select("*")
      .eq("id", row.investment_profile_id)
      .maybeSingle();
    profile = data;
    const [{ data: ev }, { data: rel }] = await Promise.all([
      db().from("entity_verifications").select("*").eq("profile_id", row.investment_profile_id).maybeSingle(),
      db()
        .from("investment_profile_relationships")
        .select("*")
        .eq("profile_id", row.investment_profile_id),
    ]);
    entity = ev;
    related = (rel ?? []) as any[];
  }

  const [{ data: accreditations }, { data: taxProfiles }, { data: signatures }] = await Promise.all([
    row.application_id
      ? db().from("accreditation_records").select("*").eq("application_id", row.application_id)
      : Promise.resolve({ data: [] as any[] }),
    row.investment_profile_id
      ? db()
          .from("investor_tax_profiles")
          .select("*")
          .eq("investment_profile_id", row.investment_profile_id)
      : Promise.resolve({ data: [] as any[] }),
    row.application_id || row.investment_profile_id
      ? db()
          .from("document_signatures")
          .select("*")
          .or(
            [
              row.application_id ? `application_id.eq.${row.application_id}` : null,
              row.investment_profile_id ? `investment_profile_id.eq.${row.investment_profile_id}` : null,
            ]
              .filter(Boolean)
              .join(","),
          )
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const { data: offeringDocs } = await db()
    .from("offering_documents")
    .select("id, title, doc_type, requires_signature")
    .eq("offering_id", row.offering_id);

  const accreditation = ((accreditations ?? []) as any[])[0] ?? null;
  const tax = ((taxProfiles ?? []) as any[])[0] ?? null;
  // Only completion evidence written by the verified signing webhook counts.
  const docScope = {
    offeringDocumentIds: ((offeringDocs ?? []) as any[]).map((d) => String(d.id)),
    investmentProfileId: (row.investment_profile_id ?? null) as string | null,
    applicationId: (row.application_id ?? null) as string | null,
  };
  const completedSignatures = ((signatures ?? []) as any[]).filter((sig) => isAuthoritativeSignature(sig, docScope));
  const requiredToSign = ((offeringDocs ?? []) as any[]).filter((d) => d.requires_signature);
  const signedIds = new Set(completedSignatures.map((sig) => sig.offering_document_id).filter(Boolean));
  const allSigned =
    completedSignatures.length > 0 &&
    (requiredToSign.length === 0 || requiredToSign.every((d) => signedIds.has(d.id)));
  const signedCount = allSigned ? completedSignatures.length : 0;

  const profileType = String(profile?.profile_type ?? "");
  const isEntity = ENTITY_PROFILE_TYPES.has(profileType as InvestmentProfileType);

  const gatingPeople = related
    .filter((r) => GATING_RELATIONSHIP_ROLES.has(r.role))
    .map((r) => ({
      role: String(r.role),
      personId: r.person_id as string | null,
      kycStatus: String(r.verification_status ?? ""),
    }));

  const requirements = determineOnboardingRequirements({
    offering,
    person: {
      personId: person?.id ?? null,
      kycStatus: person?.kyc_status ?? null,
      kycExpiresAt: person?.reverification_due_at ?? null,
      amlStatus: person?.aml_status ?? null,
      amlCompletedAt: person?.aml_screened_at ?? null,
      countryOfResidence: person?.residence_country ?? null,
    },
    profile: profile
      ? {
          profileId: profile.id,
          profileType: profile.profile_type,
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
      requestedAmountCents: row.requested_amount_cents,
      questionnaireVersion: row.questionnaire_version,
      questionnaireComplete: Boolean(row.questionnaire_version),
      documentsPrepared: Boolean(row.document_template_version),
      signatureStatus: signedCount > 0 ? "completed" : null,
      fundingStatus: row.funding_status,
    },
    nowIso: nowIso(),
  });

  const documents = ((offeringDocs ?? []) as any[]).map((d) => ({
    id: String(d.id),
    title: String(d.title ?? d.doc_type ?? "Document"),
    requiresSignature: Boolean(d.requires_signature),
    signed: signedIds.has(d.id),
  }));
  return { offering, person, profile, entity, related, accreditation, tax, requirements, isEntity, documents, completedSignatures };
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
    legalName: (setup.legal_fund_name ?? offering.legal_entity_name ?? null) as string | null,
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

  const { data: existing } = await db()
    .from("investor_onboardings")
    .select("*")
    .eq("offering_id", offering.id)
    .eq("investor_user_id", actor.userId)
    .not("stage", "in", "(closed,declined,cancelled)")
    .order("created_at", { ascending: false })
    .limit(1);
  const open = ((existing ?? []) as any[])[0];
  if (open) return { onboardingId: open.id as string, resumed: true };

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
  if (error) fail(error.message);

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
  return { onboardingId: created.id as string, resumed: false };
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
    create?: { profileType: string; displayLabel: string; legalName?: string | null } | undefined;
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
        status: "active",
      })
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
  const problem = amountError(input.amountCents, offering);
  if (problem) fail(problem);
  await touch(row.id, { requested_amount_cents: input.amountCents });
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

async function publishedQuestionnaire(offeringId: string) {
  const { data } = await db()
    .from("offering_questionnaires")
    .select("*")
    .eq("offering_id", offeringId)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1);
  return ((data ?? []) as any[])[0] ?? null;
}

export async function saveQuestionnaire(
  userId: string,
  input: { onboardingId: string; answers: Record<string, unknown>; submit?: boolean },
) {
  const { actor, row } = await assertInvestorOwns(userId, input.onboardingId);
  const questionnaire = await publishedQuestionnaire(row.offering_id);
  const questions = (questionnaire?.questions ?? []) as Question[];

  if (input.submit) {
    const result = validateQuestionnaire(questions, input.answers);
    if (!result.valid) fail(result.errors[0]!.message);
  }
  await touch(row.id, {
    questionnaire_responses: input.answers,
    ...(input.submit ? { questionnaire_version: questionnaire?.version ?? 1 } : {}),
  });
  await recordEvent({
    onboardingId: row.id,
    offeringId: row.offering_id,
    event: input.submit ? "questionnaire_submitted" : "questionnaire_saved",
    actorUserId: actor.userId,
    actorRole: "investor",
  });
  return { saved: true };
}

/**
 * Freeze the exact subscription package the investor will sign. A later
 * template change can never alter an already prepared or executed package.
 */
export async function prepareSubscriptionDocuments(userId: string, onboardingId: string) {
  const { actor, row } = await assertInvestorOwns(userId, onboardingId);
  if (row.executed_snapshot) return { alreadyPrepared: true };

  const facts = await gatherFacts(row);
  const missing = outstandingRequirements(facts.requirements).filter(
    (r) => !["subscription_documents", "signature", "funding"].includes(r.key),
  );
  if (missing.length > 0) fail(`${missing[0]!.label} must be completed first.`);

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
  const { actor, row } = await assertInvestorOwns(userId, input.onboardingId);
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

/** "I sent my funds" — informational only; it never makes an investment funded. */
export async function investorReportsFundsSent(userId: string, onboardingId: string) {
  const { actor, row } = await assertInvestorOwns(userId, onboardingId);
  if (!row.approved_to_fund_at) forbid("funding has not been unlocked for this investment.");
  await touch(row.id, {
    investor_reports_sent_at: nowIso(),
    funding_status: row.funding_status === "not_funded" ? "investor_reports_sent" : row.funding_status,
  });
  await recordEvent({
    onboardingId: row.id,
    offeringId: row.offering_id,
    event: "investor_reports_funds_sent",
    actorUserId: actor.userId,
    actorRole: "investor",
  });
  return { acknowledged: true };
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

export async function onboardingDetail(userId: string, onboardingId: string): Promise<any> {
  const { actor, row, role } = await assertOnboardingAccess(userId, onboardingId);
  const facts = await gatherFacts(row);
  const exceptions = await openExceptions(row.id);
  const fundingGate = canInvestorFund({
    stage: row.stage,
    requirements: facts.requirements,
    approvedToFundAt: row.approved_to_fund_at,
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
  const journey = journeySteps(facts.requirements, {
    stage: row.stage,
    approvedToFund: Boolean(row.approved_to_fund_at),
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
    questionnaire: questionnaire ? { version: questionnaire.version, questions: questionnaire.questions } : null,
    questionnaireResponses: (row.questionnaire_responses ?? {}) as Record<string, unknown>,
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

/** Approved, versioned banking instructions — released only by Harmonious. */
export async function fundingInstructions(userId: string, onboardingId: string) {
  const { row, role } = await assertOnboardingAccess(userId, onboardingId);
  if (role === "manager") forbid("fund managers do not receive investor funding instructions.");
  const facts = await gatherFacts(row);
  const exceptions = await openExceptions(row.id);
  const gate = canInvestorFund({
    stage: row.stage,
    requirements: facts.requirements,
    approvedToFundAt: row.approved_to_fund_at,
    openBlockingExceptions: exceptions.filter((e) => e.severity === "blocking").length,
  });
  if (!gate.allowed) return { unlocked: false, reasons: gate.reasons, instructions: null };

  const { data: wire } = await db().rpc("get_wire_instructions", { p_offering_id: row.offering_id });
  const details = Array.isArray(wire) ? (wire[0]?.details ?? null) : ((wire as any)?.details ?? null);
  const { data: setup } = await db()
    .from("fund_setups")
    .select("id")
    .eq("offering_id", row.offering_id)
    .maybeSingle();
  const { data: banking } = setup?.id
    ? await db().from("fund_banking_setups").select("*").eq("setup_id", setup.id).maybeSingle()
    : { data: null };

  if (!banking || banking.status !== "account_active" || !banking.investor_instructions_released) {
    return {
      unlocked: false,
      reasons: ["The fund's banking instructions have not been released yet."],
      instructions: null,
    };
  }
  return {
    unlocked: true,
    reasons: [] as string[],
    instructions: {
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
    openBlockingExceptions: blocking,
  });
  const closingGate = canCloseInvestment({
    stage: row.stage,
    requirements: facts.requirements,
    approvedToFundAt: row.approved_to_fund_at,
    openBlockingExceptions: blocking,
    fundingStatus: row.funding_status,
    fundingReconciled: row.funding_status === "funded",
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
          // Never the reference or full identifier — last four only.
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
  const actor = await assertStaff(userId);
  const row = await onboardingRow(input.onboardingId);
  const facts = await gatherFacts(row);
  const exceptions = await openExceptions(row.id);
  const blocking = exceptions.filter((e) => e.severity === "blocking").length;
  const outstanding = outstandingRequirements(facts.requirements);
  if (outstanding.length > 0) fail(`${outstanding[0]!.label} is not complete.`);
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
    actorRole: "harmonious",
  });
  await touch(row.id, { stage: "awaiting_funds" });
  await syncInvitation(row);
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
  if (!isExceptionType(input.type)) fail("That is not a recognised exception.");
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
    acceptance_capacity: `${input.signerName} — ${input.capacity}`,
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
    openBlockingExceptions: exceptions.filter((e) => e.severity === "blocking").length,
    fundingStatus: row.funding_status,
    fundingReconciled: row.funding_status === "funded",
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

  const investorIds = [...new Set(rows.map((r) => r.investor_user_id))];
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
        investorName: byUser.get(row.investor_user_id)?.legal_name ?? "Investor",
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
  // Invitations nobody has opened yet — shown as "Invited", never as progress.
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
    // Derived from the offering's configuration — never chosen at invite time.
    exemption: ((invitedOffering as any).reg_type ?? null) as string | null,
    link: `/invest/${(invitedOffering as any).slug ?? input.offeringId}?invite=${data.token}`,
  };
}

// ------------------------------------------------ verification (Didit)

/**
 * Start (or resume) the existing Didit verification session for the
 * application behind this investment. Same session, webhook and
 * reconciliation paths — no second verification system.
 */
export async function startInvestmentVerification(userId: string, onboardingId: string, origin: string) {
  const { row } = await assertInvestorOwns(userId, onboardingId);
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
  if (!applicationId) {
    fail("Harmonious is setting up verification for this investment. We'll email you when it's ready.");
  }
  const { startVerificationSession } = await import("@/lib/kyc-verification.server");
  const result = await startVerificationSession({ applicationId, userId: row.investor_user_id, origin });
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
