/**
 * Server-side identity layer for Phase 2.
 *
 * One canonical person per human, a server-enforced onboarding state machine,
 * and one readiness decision — `canInvest(profile, offering)` — that resolves
 * every id against the stored row rather than trusting the browser.
 *
 * Nothing here weakens the existing admin / fund-manager / investor / staff
 * authorization, and staff and service workflows are never held by the
 * external-user onboarding gate.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  canTransition,
  GATING_RELATIONSHIP_ROLES,
  isEntityProfileType,
  ONBOARDING_PASS_STATES,
  type OnboardingState,
  type ProfileRelationshipRole,
  type ReadinessReason,
  type ReadinessResult,
} from "@/lib/identity-model";

const db = () => supabaseAdmin as any;

export interface PersonRecord {
  id: string;
  user_id: string | null;
  onboarding_state: OnboardingState;
  kyc_status: string;
  aml_status: string;
  [key: string]: unknown;
}

/** Columns that never leave the server. */
const RESTRICTED_PERSON_FIELDS = ["date_of_birth", "tax_id_reference"] as const;

/** A person record safe to hand to a browser. */
export function redactPerson<T extends Record<string, any>>(person: T | null): T | null {
  if (!person) return person;
  const safe: Record<string, any> = { ...person };
  for (const field of RESTRICTED_PERSON_FIELDS) delete safe[field];
  safe["date_of_birth_on_file"] = !!person["date_of_birth"];
  safe["tax_id_on_file"] = !!(person["tax_id_reference"] || person["tax_id_last4"]);
  return safe as T;
}

/** The canonical person for a signed-in account, created on first need. */
export async function ensurePerson(
  userId: string,
  seed?: { email?: string | null; legal_name?: string | null; phone?: string | null },
): Promise<PersonRecord> {
  const existing = await db().from("persons").select("*").eq("user_id", userId).maybeSingle();
  if (existing.data) return existing.data as PersonRecord;

  const name = (seed?.legal_name ?? "").trim();
  const first = name ? name.split(/\s+/)[0] : null;
  const last = name.includes(" ") ? name.slice(name.indexOf(" ") + 1) : null;

  const created = await db()
    .from("persons")
    .insert({
      user_id: userId,
      legal_first_name: first,
      legal_last_name: last,
      email: seed?.email ?? null,
      phone: seed?.phone ?? null,
      onboarding_state: "account_created",
    })
    .select("*")
    .single();
  if (created.error) throw new Error(created.error.message);
  return created.data as PersonRecord;
}

/**
 * Moves a person through the onboarding state machine. Illegal moves are
 * refused, and every move is written to the append-only history.
 */
export async function setOnboardingState(
  personId: string,
  to: OnboardingState,
  options: { actorUserId?: string | null; actorKind?: string; reason?: string; detail?: unknown } = {},
): Promise<{ ok: boolean; state: OnboardingState; reason?: string }> {
  const { data: person } = await db()
    .from("persons")
    .select("id, onboarding_state")
    .eq("id", personId)
    .maybeSingle();
  if (!person) return { ok: false, state: "account_created", reason: "Person not found." };

  const from = person.onboarding_state as OnboardingState;
  if (from === to) return { ok: true, state: from };
  if (!canTransition(from, to)) {
    return { ok: false, state: from, reason: `Cannot move from ${from} to ${to}.` };
  }

  const { error } = await db()
    .from("persons")
    .update({ onboarding_state: to, onboarding_reason: options.reason ?? null, updated_at: new Date().toISOString() })
    .eq("id", personId);
  if (error) throw new Error(error.message);

  await db().from("person_onboarding_events").insert({
    person_id: personId,
    from_state: from,
    to_state: to,
    actor_user_id: options.actorUserId ?? null,
    actor_kind: options.actorKind ?? "system",
    reason: options.reason ?? null,
    detail: (options.detail as any) ?? null,
  });

  return { ok: true, state: to };
}

/**
 * Derives the state the person should be in from the compliance records that
 * actually exist, and records the move. Clients can never assert a state.
 */
export async function refreshOnboardingState(personId: string): Promise<OnboardingState> {
  const { data: person } = await db()
    .from("persons")
    .select("id, onboarding_state, kyc_status, aml_status, legal_first_name, legal_last_name, reverification_due_at")
    .eq("id", personId)
    .maybeSingle();
  if (!person) return "account_created";

  const now = Date.now();
  let target: OnboardingState;

  if (person.kyc_status === "declined" || person.aml_status === "declined") target = "failed";
  else if (person.kyc_status === "review" || person.aml_status === "review") target = "review_required";
  else if (person.kyc_status === "approved" && person.aml_status === "approved") {
    target =
      person.reverification_due_at && new Date(person.reverification_due_at).getTime() <= now
        ? "reverification_required"
        : "verified";
  } else if (person.kyc_status === "approved") target = "aml_pending";
  else if (person.kyc_status === "pending") target = "kyc_pending";
  else if (person.legal_first_name && person.legal_last_name) target = "identity_required";
  else target = "profile_required";

  if (target === person.onboarding_state) return target;
  const moved = await setOnboardingState(personId, target, { reason: "derived from compliance records" });
  return moved.ok ? target : (person.onboarding_state as OnboardingState);
}

export interface GateResult {
  allowed: boolean;
  state: OnboardingState;
  personId: string | null;
  /** Staff and service workflows are never held by the external gate. */
  bypass: "staff" | null;
  nextStep: string | null;
}

/** The server-enforced onboarding gate for an external (non-staff) person. */
export async function evaluateOnboardingGate(userId: string | null | undefined): Promise<GateResult> {
  if (!userId) {
    return { allowed: false, state: "account_created", personId: null, bypass: null, nextStep: "Sign in" };
  }

  const { data: roles } = await db().from("user_roles").select("role").eq("user_id", userId);
  const list = ((roles ?? []) as any[]).map((r) => String(r.role));
  const staffRoles = [
    "admin",
    "super_admin",
    "operations",
    "legal",
    "compliance",
    "fund_administration",
    "tax",
    "finance",
    "client_success",
    "executive",
    "fund_manager",
  ];
  if (list.some((r) => staffRoles.includes(r))) {
    const staffPerson = await db().from("persons").select("id").eq("user_id", userId).maybeSingle();
    return {
      allowed: true,
      state: "verified",
      personId: (staffPerson.data?.id as string) ?? null,
      bypass: "staff",
      nextStep: null,
    };
  }

  const person = await ensurePerson(userId);
  const state = await refreshOnboardingState(person.id);

  const NEXT: Record<OnboardingState, string | null> = {
    account_created: "Tell us who you are",
    profile_required: "Tell us who you are",
    identity_required: "Verify your identity",
    kyc_pending: "Identity check in progress",
    aml_pending: "Complete the screening questionnaire",
    review_required: "Our team is reviewing your checks",
    verified: null,
    failed: "Contact your Harmonious representative",
    reverification_required: "Re-verify your identity",
  };

  return {
    allowed: ONBOARDING_PASS_STATES.has(state),
    state,
    personId: person.id,
    bypass: null,
    nextStep: NEXT[state],
  };
}

/** Throws unless the person may reach protected investor data. */
export async function assertOnboardingSatisfied(userId: string | null | undefined): Promise<GateResult> {
  const gate = await evaluateOnboardingGate(userId);
  if (!gate.allowed) throw new Error(gate.nextStep ?? "Identity onboarding is not complete.");
  return gate;
}

const reason = (code: ReadinessReason["code"], message: string): ReadinessReason => ({ code, message });

/**
 * Can this investment profile invest in this offering?
 *
 * Both ids are resolved against the database, the profile's real owner is
 * checked against the actor, and every requirement comes from the offering's
 * own configuration rather than a fixed assumption.
 */
export async function canInvest(
  actorUserId: string | null | undefined,
  profileId: string,
  offeringId: string,
): Promise<ReadinessResult> {
  const reasons: ReadinessReason[] = [];
  const fail = (r: ReadinessReason): ReadinessResult => ({
    ready: false,
    profileId,
    offeringId,
    reasons: [r],
  });

  const { data: profile } = await db()
    .from("investment_profiles")
    .select("id, owner_user_id, person_id, profile_type, display_label, status")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return fail(reason("profile_not_found", "That investment profile was not found."));

  if (actorUserId && profile.owner_user_id !== actorUserId) {
    const { data: related } = await db()
      .from("investment_profile_relationships")
      .select("id, persons!inner(user_id)")
      .eq("profile_id", profileId)
      .eq("persons.user_id", actorUserId)
      .maybeSingle();
    if (!related) return fail(reason("not_your_profile", "That investment profile was not found."));
  }

  const { data: offering } = await db()
    .from("offerings")
    .select("id, reg_type")
    .eq("id", offeringId)
    .maybeSingle();
  if (!offering) return fail(reason("offering_not_found", "That offering was not found."));

  const { data: config } = await db()
    .from("offering_requirements")
    .select("*")
    .eq("offering_id", offeringId)
    .maybeSingle();

  const requirements = {
    accreditation_required: config?.accreditation_required ?? offering.reg_type !== "regcf",
    accreditation_verification: config?.accreditation_verification ?? "self_attested",
    accreditation_max_age_days: config?.accreditation_max_age_days ?? null,
    requires_person_kyc: config?.requires_person_kyc ?? true,
    requires_person_aml: config?.requires_person_aml ?? true,
    requires_entity_kyb: config?.requires_entity_kyb ?? true,
    requires_control_person_kyc: config?.requires_control_person_kyc ?? true,
  };

  // The human behind the profile.
  const ownerPersonId = profile.person_id as string | null;
  const { data: ownerPerson } = ownerPersonId
    ? await db()
        .from("persons")
        .select("id, kyc_status, aml_status, onboarding_state")
        .eq("id", ownerPersonId)
        .maybeSingle()
    : await db()
        .from("persons")
        .select("id, kyc_status, aml_status, onboarding_state")
        .eq("user_id", profile.owner_user_id)
        .maybeSingle();

  if (requirements.requires_person_kyc) {
    if (!ownerPerson || ownerPerson.kyc_status === "not_started") {
      reasons.push(reason("person_kyc_required", "Identity verification required"));
    } else if (ownerPerson.kyc_status !== "approved") {
      reasons.push(reason("person_kyc_pending", "Identity verification in review"));
    }
  }
  if (requirements.requires_person_aml && ownerPerson) {
    if (ownerPerson.aml_status === "not_started") {
      reasons.push(reason("person_aml_required", "Screening questionnaire required"));
    } else if (ownerPerson.aml_status !== "approved") {
      reasons.push(reason("person_aml_pending", "AML review pending"));
    }
  }

  // The entity itself is verified separately: a person's KYC never verifies
  // their LLC or trust.
  if (isEntityProfileType(profile.profile_type) && requirements.requires_entity_kyb) {
    const { data: kyb } = await db()
      .from("entity_verifications")
      .select("kyb_status, entity_aml_status, expires_at")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (!kyb || kyb.kyb_status === "not_started") {
      reasons.push(reason("kyb_required", "KYB required"));
    } else if (kyb.kyb_status !== "approved") {
      reasons.push(reason("kyb_pending", "KYB review pending"));
    } else if (kyb.expires_at && new Date(kyb.expires_at).getTime() <= Date.now()) {
      reasons.push(reason("kyb_required", "KYB re-verification required"));
    }
    if (kyb && kyb.entity_aml_status !== "approved" && kyb.entity_aml_status !== "not_started") {
      reasons.push(reason("entity_aml_pending", "Entity screening pending"));
    }
  }

  // Trustees, control persons and signers carry their own personal KYC.
  if (requirements.requires_control_person_kyc && isEntityProfileType(profile.profile_type)) {
    const { data: related } = await db()
      .from("investment_profile_relationships")
      .select("role, status, person_id, persons(kyc_status, legal_last_name)")
      .eq("profile_id", profileId);
    for (const row of (related ?? []) as any[]) {
      if (row.status !== "active") continue;
      if (!GATING_RELATIONSHIP_ROLES.has(row.role as ProfileRelationshipRole)) continue;
      if (row.persons?.kyc_status !== "approved") {
        reasons.push(
          reason(
            "related_person_kyc_required",
            `${String(row.role).replace(/_/g, " ")} identity verification required`,
          ),
        );
      }
    }
  }

  // Accreditation belongs to the profile that is actually subscribing.
  if (requirements.accreditation_required) {
    const { data: accreditations } = await db()
      .from("profile_accreditations")
      .select("status, verification_method, verified_at, expires_at, offering_id")
      .eq("profile_id", profileId);
    const rows = ((accreditations ?? []) as any[]).filter(
      (a) => a.offering_id === offeringId || a.offering_id === null,
    );
    const best =
      rows.find((a) => a.offering_id === offeringId) ?? rows.find((a) => a.offering_id === null);

    if (!best || best.status === "not_started") {
      reasons.push(reason("accreditation_required", "Accreditation required"));
    } else if (best.status !== "approved") {
      reasons.push(reason("accreditation_pending", "Accreditation under review"));
    } else {
      const expired = best.expires_at && new Date(best.expires_at).getTime() <= Date.now();
      const tooOld =
        !expired &&
        requirements.accreditation_max_age_days &&
        best.verified_at &&
        Date.now() - new Date(best.verified_at).getTime() >
          requirements.accreditation_max_age_days * 86_400_000;
      if (expired || tooOld) {
        reasons.push(reason("accreditation_expired", "Accreditation expired"));
      } else if (
        requirements.accreditation_verification === "third_party_verified" &&
        best.verification_method !== "third_party_verified"
      ) {
        reasons.push(
          reason("accreditation_required", "Third-party accreditation verification required"),
        );
      }
    }
  }

  return { ready: reasons.length === 0, profileId, offeringId, reasons };
}

/**
 * Freezes the investing profile as it stands, so later edits to an address,
 * a legal name, ownership, trustees or signers never rewrite an executed
 * subscription record.
 */
export async function snapshotInvestmentProfile(input: {
  profileId: string;
  applicationId?: string | null;
  subscriptionId?: string | null;
  offeringId?: string | null;
  reason?: string;
  createdBy?: string | null;
}): Promise<string | null> {
  const [{ data: profile }, { data: relationships }, { data: kyb }, { data: accreditations }] =
    await Promise.all([
      db().from("investment_profiles").select("*").eq("id", input.profileId).maybeSingle(),
      db()
        .from("investment_profile_relationships")
        .select("role, ownership_percent, is_authorized_signer, status, verification_status, person_id")
        .eq("profile_id", input.profileId),
      db().from("entity_verifications").select("*").eq("profile_id", input.profileId).maybeSingle(),
      db().from("profile_accreditations").select("*").eq("profile_id", input.profileId),
    ]);
  if (!profile) return null;

  const person = profile.person_id
    ? (await db().from("persons").select("*").eq("id", profile.person_id).maybeSingle()).data
    : (await db().from("persons").select("*").eq("user_id", profile.owner_user_id).maybeSingle())
        .data;

  const created = await db()
    .from("investment_profile_snapshots")
    .insert({
      profile_id: input.profileId,
      application_id: input.applicationId ?? null,
      subscription_id: input.subscriptionId ?? null,
      offering_id: input.offeringId ?? null,
      reason: input.reason ?? "subscription_executed",
      created_by: input.createdBy ?? null,
      snapshot: {
        taken_at: new Date().toISOString(),
        profile,
        person: redactPerson(person),
        relationships: relationships ?? [],
        entity_verification: kyb ?? null,
        accreditations: accreditations ?? [],
      },
    })
    .select("id")
    .maybeSingle();

  return (created.data?.id as string) ?? null;
}
