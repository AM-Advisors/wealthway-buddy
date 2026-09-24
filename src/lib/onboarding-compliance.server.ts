/**
 * Server side of Stage 2: loads facts, runs the pure rules and writes
 * immutable, versioned records. Only called from authenticated server
 * functions after the caller's access to the onboarding is checked.
 */
import {
  BAD_ACTOR_QUESTIONNAIRE_VERSION,
  BAD_ACTOR_WORDING_STATUS,
  CERTIFICATIONS,
  CERTIFICATION_WORDING_STATUS,
  IRS_FORM_REVISIONS,
  badActorApplies,
  badActorRequirementState,
  certificationState,
  effectiveEligibility,
  eligibilityChecklistState,
  eligibilityOutcome,
  evaluateBadActor,
  parseEligibilityConfig,
  requiredCertifications,
  resolveTaxForm,
  taxFormExpiresOn,
  taxRequirementState,
  tinLast4,
  validTin,
  type BadActorConfig,
  type CertificationKey,
  type TaxFormType,
} from "@/lib/onboarding-compliance-model";
import { ENTITY_PROFILE_TYPES } from "@/lib/identity-model";

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

function fail(message: string): never {
  throw new Error(message);
}

/** Keyed fingerprint so a changed TIN is detectable without storing it. */
async function tinFingerprint(tin: string): Promise<string> {
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? "harmonious-tin";
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(tin.replace(/\D/g, "")));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function offeringRules(offeringId: string): Promise<{ regType: string | null; rules: Record<string, any> }> {
  const d = await db();
  const [{ data: offering }, { data: setup }] = await Promise.all([
    d.from("offerings").select("reg_type").eq("id", offeringId).maybeSingle(),
    d.from("fund_setups").select("id").eq("offering_id", offeringId).maybeSingle(),
  ]);
  let rules: Record<string, any> = {};
  if (setup?.id) {
    const { data } = await d
      .from("fund_eligibility_configs")
      .select("rules")
      .eq("setup_id", setup.id)
      .eq("status", "approved")
      .order("version", { ascending: false })
      .limit(1);
    rules = (data?.[0]?.rules ?? {}) as Record<string, any>;
  }
  return { regType: offering?.reg_type ?? null, rules };
}

export function usPersonFrom(tax: any, person: any): boolean | null {
  const c = String(tax?.classification ?? "").toLowerCase();
  if (c === "foreign" || c.startsWith("foreign_")) return false;
  if (c.startsWith("us_") || c === "domestic" || c === "us_person") return true;
  const residency = String(tax?.tax_residency_country ?? "").toUpperCase();
  if (residency) return residency === "US";
  return null;
}

async function coveredRoles(userId: string, offeringId: string, config: any): Promise<string[]> {
  const d = await db();
  const roles = new Set<string>();
  const { data: mgr } = await d.from("fund_managers").select("id").eq("offering_id", offeringId).eq("user_id", userId).maybeSingle();
  if (mgr) roles.add("manager");
  for (const p of (config?.coveredPersons ?? []) as any[]) {
    if (p?.userId === userId) for (const r of p.roles ?? []) roles.add(String(r));
  }
  return [...roles];
}

export interface Stage2Input {
  onboarding: { id: string; offering_id: string; investor_user_id: string; investment_profile_id: string | null };
  profileType: string | null;
  tax: any;
  person: any;
  delegated?: boolean;
  nowIso: string;
  taxRequired: boolean;
}

/** Resolve Stage 2 checklist entries for ONE investment. */
export async function resolveStage2(input: Stage2Input) {
  const d = await db();
  const profileId = input.onboarding.investment_profile_id;
  const { regType, rules } = await offeringRules(input.onboarding.offering_id);

  const routing = resolveTaxForm({
    profileType: input.profileType,
    usPerson: usPersonFrom(input.tax, input.person),
    claimsEffectivelyConnectedIncome: rules['taxFacts']?.eci ?? null,
  });
  const [{ data: forms }, { data: responses }, { data: certs }, { data: eligResponses }] = await Promise.all([
    profileId ? d.from("investor_tax_forms").select("id, investment_profile_id, form_type, classification, status, tin_fingerprint, legal_name, expires_on, certified_at").eq("investment_profile_id", profileId) : { data: [] },
    d.from("compliance_questionnaire_responses").select("id, review_status, superseded_by, created_at").eq("onboarding_id", input.onboarding.id).eq("kind", "bad_actor").is("superseded_by", null).order("created_at", { ascending: false }).limit(1),
    d.from("investor_certifications").select("certification_key, certification_version").eq("onboarding_id", input.onboarding.id),
    d.from("investor_certifications").select("certification_key, evidence").eq("onboarding_id", input.onboarding.id).like("certification_key", "eligibility:%"),
  ]);

  const tax = taxRequirementState({ required: input.taxRequired, routing, profileId, forms: (forms ?? []) as any[], nowIso: input.nowIso });

  const baConfig = (rules['badActor'] ?? null) as BadActorConfig | null;
  const roles = await coveredRoles(input.onboarding.investor_user_id, input.onboarding.offering_id, baConfig);
  const baApplies = badActorApplies(baConfig, roles);
  const badActor = badActorRequirementState({ applies: baApplies, latest: (responses ?? [])[0] ?? null });

  const elig = effectiveEligibility({ regType, approved: parseEligibilityConfig(rules['eligibilityRequirements']) });
  const respByKey = new Map<string, any>(
    ((eligResponses ?? []) as any[]).map((r) => [String(r.certification_key).slice("eligibility:".length), r.evidence ?? {}]),
  );
  const outcomes = elig.map((r) => ({ key: r.key, outcome: eligibilityOutcome(r, respByKey.get(r.key)) }));
  const eligState = eligibilityChecklistState(outcomes.map((o) => o.outcome));

  const isEntity = ENTITY_PROFILE_TYPES.has(String(input.profileType ?? "") as any);
  const requiredCerts = requiredCertifications({
    isEntityOrDelegated: isEntity || Boolean(input.delegated),
    hasOfferingRepresentations: elig.some((r) => r.category === "representation"),
  });
  const cert = certificationState(requiredCerts, (certs ?? []) as any[]);

  return {
    routing,
    taxState: tax,
    badActorApplies: baApplies,
    badActorState: badActor,
    eligibility: outcomes,
    eligibilityState: { state: eligState, reason: eligState === "review_required" ? "Offering eligibility requires review" : undefined },
    requiredCertifications: requiredCerts,
    certificationState: { state: cert.state, reason: cert.missing.length ? "Review and certify your information." : undefined },
    missingCertifications: cert.missing,
  };
}

async function loadOwnOnboarding(userId: string, onboardingId: string) {
  const d = await db();
  const { data: ob } = await d
    .from("investor_onboardings")
    .select("id, offering_id, investor_user_id, investment_profile_id")
    .eq("id", onboardingId)
    .maybeSingle();
  if (!ob || ob.investor_user_id !== userId) fail("Forbidden: this investment is not yours.");
  if (!ob.investment_profile_id) fail("Choose who is making this investment first.");
  const { data: profile } = await d.from("investment_profiles").select("id, profile_type, legal_name, display_name").eq("id", ob.investment_profile_id).maybeSingle();
  if (!profile) fail("Investment profile not found.");
  return { d, ob, profile };
}

async function raiseOpsException(onboardingId: string, type: string, detail: string, userId: string) {
  const d = await db();
  const { data: open } = await d
    .from("investor_onboarding_exceptions")
    .select("id")
    .eq("onboarding_id", onboardingId)
    .eq("exception_type", type)
    .eq("status", "open")
    .maybeSingle();
  if (open) return;
  await d.from("investor_onboarding_exceptions").insert({
    onboarding_id: onboardingId,
    exception_type: type,
    severity: "blocking",
    owner: "harmonious",
    status: "open",
    detail,
    raised_by: userId,
  });
}

/** Investor view: what they need to do. No other person's data, TIN never returned. */
export async function investorComplianceView(userId: string, onboardingId: string) {
  const { d, ob, profile } = await loadOwnOnboarding(userId, onboardingId);
  const [{ data: tax }, { data: person }] = await Promise.all([
    d.from("investor_tax_profiles").select("classification, tax_residency_country").eq("investment_profile_id", ob.investment_profile_id).maybeSingle(),
    d.from("persons").select("legal_name, residence_country").eq("user_id", userId).maybeSingle(),
  ]);
  const r = await resolveStage2({
    onboarding: ob, profileType: profile.profile_type, tax, person, nowIso: new Date().toISOString(), taxRequired: true,
  });
  const { data: current } = await d
    .from("investor_tax_forms")
    .select("form_type, irs_revision, tin_last4, certified_at, status, expires_on")
    .eq("investment_profile_id", ob.investment_profile_id)
    .neq("status", "superseded")
    .order("certified_at", { ascending: false })
    .limit(1);
  return {
    profileName: profile.legal_name ?? profile.display_name ?? "",
    tax: {
      state: r.taxState.state,
      reason: r.taxState.reason ?? null,
      form: r.routing.status === "determined" ? IRS_FORM_REVISIONS[r.routing.formType] : null,
      current: current?.[0]
        ? { formType: current[0].form_type, revision: current[0].irs_revision, tinMasked: current[0].tin_last4 ? `•••-••-${current[0].tin_last4}` : null, certifiedAt: current[0].certified_at, expiresOn: current[0].expires_on }
        : null,
    },
    badActor: { applies: r.badActorApplies, state: r.badActorState.state, version: BAD_ACTOR_QUESTIONNAIRE_VERSION, wordingStatus: BAD_ACTOR_WORDING_STATUS },
    eligibility: r.eligibility,
    certifications: {
      required: r.requiredCertifications.map((k) => ({ key: k, heading: CERTIFICATIONS[k].heading, version: CERTIFICATIONS[k].version })),
      missing: r.missingCertifications,
      wordingStatus: CERTIFICATION_WORDING_STATUS,
    },
  };
}

/** Certify the resolved IRS form. Previous forms are superseded, never overwritten. */
export async function certifyTaxForm(
  userId: string,
  input: { onboardingId: string; formType: TaxFormType; legalName: string; tin?: string | null; certifiedName: string; acknowledgedRevision: string; userAgent?: string | null },
) {
  const { d, ob, profile } = await loadOwnOnboarding(userId, input.onboardingId);
  const [{ data: tax }, { data: person }] = await Promise.all([
    d.from("investor_tax_profiles").select("classification, tax_residency_country").eq("investment_profile_id", ob.investment_profile_id).maybeSingle(),
    d.from("persons").select("residence_country").eq("user_id", userId).maybeSingle(),
  ]);
  const routing = resolveTaxForm({ profileType: profile.profile_type, usPerson: usPersonFrom(tax, person) });
  if (routing.status !== "determined") {
    await raiseOpsException(ob.id, "tax_classification_review", routing.reason, userId);
    fail("Harmonious needs to confirm your tax classification before you complete a tax form.");
  }
  // The server decides the form; a browser asking for another form is refused.
  if (routing.formType !== input.formType) fail("That tax form does not apply to this investing profile.");
  const rev = IRS_FORM_REVISIONS[routing.formType];
  if (input.acknowledgedRevision !== rev.revision) fail("The form revision changed. Reload and review the current form.");
  if (routing.formType === "w9" && (!input.tin || !validTin(input.tin))) fail("Enter a valid 9-digit taxpayer identification number.");
  if (input.certifiedName.trim().toLowerCase() !== input.legalName.trim().toLowerCase() && input.certifiedName.trim().length < 2) {
    fail("Type your full name to certify.");
  }
  const now = new Date().toISOString();
  const fp = input.tin ? await tinFingerprint(input.tin) : null;
  const { data: inserted, error } = await d
    .from("investor_tax_forms")
    .insert({
      investment_profile_id: ob.investment_profile_id,
      investor_user_id: userId,
      onboarding_id: ob.id,
      form_type: routing.formType,
      irs_revision: rev.revision,
      irs_source_url: rev.sourceUrl,
      classification: routing.classification,
      legal_name: input.legalName.trim(),
      tin_last4: input.tin ? tinLast4(input.tin) : null,
      tin_fingerprint: fp,
      country: tax?.tax_residency_country ?? null,
      status: "certified",
      certified_name: input.certifiedName.trim(),
      certified_at: now,
      certification_evidence: { method: "typed_name", user_agent: input.userAgent ?? null, revision: rev.revision, source: rev.sourceUrl },
      expires_on: taxFormExpiresOn(routing.formType, now),
    })
    .select("id")
    .single();
  if (error) fail(error.message);
  await d
    .from("investor_tax_forms")
    .update({ status: "superseded", superseded_by: inserted.id, superseded_at: now })
    .eq("investment_profile_id", ob.investment_profile_id)
    .neq("id", inserted.id)
    .neq("status", "superseded");
  await d.from("investor_onboarding_events").insert({
    onboarding_id: ob.id, event_type: "tax_form_certified", actor_id: userId,
    detail: { form_type: routing.formType, revision: rev.revision },
  }).then(() => null, () => null);
  return { ok: true };
}

/** Submit a Bad Actor response. Any "yes" → Compliance Review Required + Ops exception. */
export async function submitBadActor(userId: string, input: { onboardingId: string; answers: Record<string, "yes" | "no">; certifiedName: string }) {
  const { d, ob } = await loadOwnOnboarding(userId, input.onboardingId);
  const { rules } = await offeringRules(ob.offering_id);
  const roles = await coveredRoles(userId, ob.offering_id, rules['badActor']);
  if (!badActorApplies(rules['badActor'] ?? null, roles)) fail("This questionnaire does not apply to this investment.");
  const ev = evaluateBadActor(input.answers);
  if (!ev.complete) fail("Answer every question.");
  if (input.certifiedName.trim().length < 2) fail("Type your full name to certify.");
  const { data: prev } = await d
    .from("compliance_questionnaire_responses")
    .select("id")
    .eq("onboarding_id", ob.id)
    .eq("kind", "bad_actor")
    .is("superseded_by", null);
  const { data: inserted, error } = await d
    .from("compliance_questionnaire_responses")
    .insert({
      kind: "bad_actor",
      questionnaire_version: BAD_ACTOR_QUESTIONNAIRE_VERSION,
      onboarding_id: ob.id,
      offering_id: ob.offering_id,
      investment_profile_id: ob.investment_profile_id,
      responder_user_id: userId,
      relationship_roles: roles,
      answers: input.answers,
      certified_name: input.certifiedName.trim(),
      review_status: ev.reviewStatus,
    })
    .select("id")
    .single();
  if (error) fail(error.message);
  for (const p of (prev ?? []) as any[]) {
    await d.from("compliance_questionnaire_responses").update({ superseded_by: inserted.id }).eq("id", p.id);
  }
  if (ev.reviewStatus === "review_required") {
    await raiseOpsException(ob.id, "bad_actor_review", "Bad Actor response requires review", userId);
  }
  return { ok: true, reviewStatus: ev.reviewStatus };
}

/** Record one distinct certification (insert-only). */
export async function certify(userId: string, input: { onboardingId: string; key: CertificationKey; certifiedName: string }) {
  const { d, ob } = await loadOwnOnboarding(userId, input.onboardingId);
  if (!(input.key in CERTIFICATIONS)) fail("Unknown certification.");
  if (input.certifiedName.trim().length < 2) fail("Type your full name to certify.");
  const { data: existing } = await d
    .from("investor_certifications")
    .select("id")
    .eq("onboarding_id", ob.id)
    .eq("certification_key", input.key)
    .eq("certification_version", CERTIFICATIONS[input.key].version)
    .maybeSingle();
  if (existing) return { ok: true, already: true };
  const { error } = await d.from("investor_certifications").insert({
    onboarding_id: ob.id,
    investment_profile_id: ob.investment_profile_id,
    investor_user_id: userId,
    certification_key: input.key,
    certification_version: CERTIFICATIONS[input.key].version,
    wording_status: CERTIFICATION_WORDING_STATUS,
    certified_name: input.certifiedName.trim(),
  });
  if (error) fail(error.message);
  return { ok: true };
}
