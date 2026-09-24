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
import {
  AUTO_EVALUATED,
  ELIGIBILITY_PROMPTS,
  ELIGIBILITY_WORDING_STATUS,
  FULL_TIN_RETAINED,
  SATISFYING_ANSWER,
  amlFields,
  amlRequirementState,
  answeredEligibility,
  autoEligibility,
  evaluateAml,
  hasTaxPermission,
  isIndividualProfile,
  routeTaxIntake,
  sanitizeDemographics,
  taxIntakeQuestions,
  taxPermissions,
  w9ClassificationFor,
  type AmlPolicy,
  type TaxIntakeAnswers,
  type TaxPermission,
} from "@/lib/onboarding-intake-model";

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
  const residency = String(tax?.tax_residency_country ?? person?.tax_residency_country ?? "").toUpperCase();
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
export async function latestTaxFacts(profileId: string | null) {
  if (!profileId) return null;
  const d = await db();
  const { data } = await d
    .from("investor_tax_facts")
    .select("id, answers, created_at")
    .eq("investment_profile_id", profileId)
    .is("superseded_by", null)
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0] ?? null) as { id: string; answers: TaxIntakeAnswers } | null;
}

/** Resolve Stage 2 + Stage 3 checklist entries for ONE investment. */
export async function resolveStage2(input: Stage2Input) {
  const d = await db();
  const profileId = input.onboarding.investment_profile_id;
  const { regType, rules } = await offeringRules(input.onboarding.offering_id);

  // Tax: the investor's own factual answers (re-derived here, never trusted as stored) win over legacy records.
  const facts = await latestTaxFacts(profileId);
  const routing = facts
    ? routeTaxIntake(input.profileType, facts.answers ?? {})
    : resolveTaxForm({
        profileType: input.profileType,
        usPerson: usPersonFrom(input.tax, input.person),
        claimsEffectivelyConnectedIncome: rules['taxFacts']?.eci ?? null,
      });
  const [{ data: forms }, { data: responses }, { data: certs }, { data: amlRows }, { data: obRow }] = await Promise.all([
    profileId ? d.from("investor_tax_forms").select("id, investment_profile_id, form_type, classification, status, tin_fingerprint, legal_name, expires_on, certified_at").eq("investment_profile_id", profileId) : { data: [] },
    d.from("compliance_questionnaire_responses").select("id, review_status, superseded_by, created_at").eq("onboarding_id", input.onboarding.id).eq("kind", "bad_actor").is("superseded_by", null).order("created_at", { ascending: false }).limit(1),
    d.from("investor_certifications").select("certification_key, certification_version, evidence, created_at").eq("onboarding_id", input.onboarding.id).order("created_at", { ascending: true }),
    d.from("compliance_questionnaire_responses").select("id, review_status, created_at").eq("onboarding_id", input.onboarding.id).eq("kind", "bsa_aml").is("superseded_by", null).order("created_at", { ascending: false }).limit(1),
    d.from("investor_onboardings").select("requested_amount_cents, accepted_amount_cents").eq("id", input.onboarding.id).maybeSingle(),
  ]);
  const eligResponses = ((certs ?? []) as any[]).filter((c) => String(c.certification_key ?? "").startsWith("eligibility:"));

  const taxClassificationState: { state: ChecklistStateT; reason?: string | undefined } = !input.taxRequired
    ? { state: "not_applicable" }
    : routing.status === "determined"
      ? { state: "valid" }
      : facts
        ? { state: "review_required", reason: "Tax Classification — Needs Review" }
        : { state: "missing", reason: "Answer a few tax questions." };
  const tax = !facts && routing.status !== "determined" && input.taxRequired
    ? { state: "missing" as const, reason: "Answer the tax questions first." }
    : taxRequirementState({ required: input.taxRequired, routing, profileId, forms: (forms ?? []) as any[], nowIso: input.nowIso });

  const baConfig = (rules['badActor'] ?? null) as BadActorConfig | null;
  const roles = await coveredRoles(input.onboarding.investor_user_id, input.onboarding.offering_id, baConfig);
  const baApplies = badActorApplies(baConfig, roles);
  const badActor = badActorRequirementState({ applies: baApplies, latest: (responses ?? [])[0] ?? null });

  const amlState = amlRequirementState((amlRows ?? [])[0] ?? null);

  const commitmentCents = obRow ? Number(obRow.accepted_amount_cents ?? obRow.requested_amount_cents ?? 0) || null : null;
  const country = String(input.person?.residence_country ?? input.tax?.tax_residency_country ?? "") || null;
  const elig = effectiveEligibility({ regType, approved: parseEligibilityConfig(rules['eligibilityRequirements']) });
  const respByKey = new Map<string, any>();
  for (const r of eligResponses) respByKey.set(String(r.certification_key).slice("eligibility:".length), r.evidence ?? {});
  const outcomes = elig.map((r) => {
    const resp = respByKey.get(r.key);
    const outcome = AUTO_EVALUATED.has(r.key)
      ? autoEligibility(r.key, r.params, { commitmentCents, profileType: input.profileType, country, waiverApproved: resp?.reviewStatus === "cleared" })
      : answeredEligibility(r.key, resp?.answer ?? (resp?.value === "flag" ? "flag" : resp?.value), resp?.reviewStatus);
    return { key: r.key, outcome, category: r.category, mandatory: r.mandatory, asked: !AUTO_EVALUATED.has(r.key), params: r.params };
  });
  const eligState = eligibilityChecklistState(outcomes.map((o) => (o.outcome === "not_started" ? "not_started" : o.outcome)));

  const isEntity = ENTITY_PROFILE_TYPES.has(String(input.profileType ?? "") as any);
  const requiredCerts = requiredCertifications({
    isEntityOrDelegated: isEntity || Boolean(input.delegated),
    hasOfferingRepresentations: elig.some((r) => r.category === "representation"),
  });
  const cert = certificationState(requiredCerts, (certs ?? []) as any[]);

  return {
    routing,
    taxFactsId: facts?.id ?? null,
    taxFactsAnswers: facts?.answers ?? null,
    taxClassificationState,
    taxState: tax,
    amlState,
    badActorApplies: baApplies,
    badActorState: badActor,
    eligibility: outcomes,
    eligibilityState: { state: eligState, reason: eligState === "review_required" ? "Offering eligibility requires review" : undefined },
    requiredCertifications: requiredCerts,
    certificationState: { state: cert.state, reason: cert.missing.length ? "Review and certify your information." : undefined },
    missingCertifications: cert.missing,
    commitmentCents,
  };
}

type ChecklistStateT = "valid" | "refresh_required" | "missing" | "review_required" | "not_applicable";

async function loadOwnOnboarding(userId: string, onboardingId: string) {
  const d = await db();
  const { data: ob } = await d
    .from("investor_onboardings")
    .select("id, offering_id, investor_user_id, investment_profile_id")
    .eq("id", onboardingId)
    .maybeSingle();
  if (!ob || ob.investor_user_id !== userId) fail("Forbidden: this investment is not yours.");
  if (!ob.investment_profile_id) fail("Choose who is making this investment first.");
  const { data: profile } = await d.from("investment_profiles").select("id, profile_type, legal_name, display_label").eq("id", ob.investment_profile_id).maybeSingle();
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

async function loadFacts(d: any, ob: any, userId: string) {
  const [{ data: tax }, { data: person }] = await Promise.all([
    d.from("investor_tax_profiles").select("classification, tax_residency_country").eq("investment_profile_id", ob.investment_profile_id).maybeSingle(),
    d.from("persons").select("id, legal_first_name, legal_last_name, tax_residency_country, residence_country, citizenship_country, address_line1, city, region, postal_code, date_of_birth").eq("user_id", userId).maybeSingle(),
  ]);
  return { tax, person };
}

async function amlPolicy(offeringId: string): Promise<AmlPolicy> {
  const { rules } = await offeringRules(offeringId);
  const p = rules['aml'] ?? {};
  return {
    eddThresholdCents: Number.isFinite(Number(p.eddThresholdCents)) && p.eddThresholdCents !== null ? Number(p.eddThresholdCents) : null,
    highRiskCountries: Array.isArray(p.highRiskCountries) ? p.highRiskCountries.map(String) : [],
  };
}

/** Investor view: what they need to do. No other person's data, TIN never returned. */
export async function investorComplianceView(userId: string, onboardingId: string) {
  const { d, ob, profile } = await loadOwnOnboarding(userId, onboardingId);
  const { tax, person } = await loadFacts(d, ob, userId);
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
  const policy = await amlPolicy(ob.offering_id);
  const known = { citizenship: person?.citizenship_country ?? null, residence: person?.residence_country ?? null, occupation: null, businessNature: null };
  const { data: amlLatest } = await d
    .from("compliance_questionnaire_responses")
    .select("answers, review_status")
    .eq("onboarding_id", ob.id).eq("kind", "bsa_aml").is("superseded_by", null)
    .order("created_at", { ascending: false }).limit(1);
  const { data: demo } = await d
    .from("compliance_questionnaire_responses")
    .select("id").eq("onboarding_id", ob.id).eq("kind", "demographics").is("superseded_by", null).limit(1);
  const answers = (r.taxFactsAnswers ?? {}) as TaxIntakeAnswers;
  return {
    profileName: profile.legal_name ?? profile.display_label ?? "",
    profileType: profile.profile_type as string,
    taxIntake: {
      answers,
      questions: taxIntakeQuestions(profile.profile_type, answers),
      state: r.taxClassificationState.state,
      reason: r.routing.status === "needs_review" && r.taxFactsId ? r.routing.reason : null,
    },
    tax: {
      state: r.taxState.state,
      reason: r.taxState.reason ?? null,
      form: r.routing.status === "determined" ? IRS_FORM_REVISIONS[r.routing.formType] : null,
      needsTin: r.routing.status === "determined" && r.routing.formType === "w9",
      tinKind: isIndividualProfile(profile.profile_type) || profile.profile_type === "ira" ? "ssn" : "ein",
      current: current?.[0]
        ? { formType: current[0].form_type, revision: current[0].irs_revision, tinMasked: current[0].tin_last4 ? `•••-••-${current[0].tin_last4}` : null, certifiedAt: current[0].certified_at, expiresOn: current[0].expires_on }
        : null,
    },
    aml: {
      state: r.amlState.state,
      fields: amlFields(policy, { profileType: profile.profile_type, commitmentCents: r.commitmentCents, known, answers: (amlLatest?.[0]?.answers ?? {}) as any }),
      submitted: Boolean(amlLatest?.[0]),
    },
    demographics: { submitted: Boolean(demo?.[0]) },
    badActor: { applies: r.badActorApplies, state: r.badActorState.state, version: BAD_ACTOR_QUESTIONNAIRE_VERSION, wordingStatus: BAD_ACTOR_WORDING_STATUS },
    eligibility: r.eligibility.map((e) => ({
      key: e.key,
      outcome: e.outcome,
      category: e.category,
      asked: e.asked,
      prompt: e.key === "custom_representation" ? (e.params?.customText ?? "") : (ELIGIBILITY_PROMPTS[e.key] ?? null),
    })),
    eligibilityWordingStatus: ELIGIBILITY_WORDING_STATUS,
    certifications: {
      required: r.requiredCertifications.map((k) => ({ key: k, heading: CERTIFICATIONS[k].heading, version: CERTIFICATIONS[k].version })),
      missing: r.missingCertifications,
      wordingStatus: CERTIFICATION_WORDING_STATUS,
    },
  };
}

/** Record factual tax answers. The server — never the browser — derives the form. */
export async function submitTaxFacts(userId: string, input: { onboardingId: string; answers: TaxIntakeAnswers }) {
  const { d, ob, profile } = await loadOwnOnboarding(userId, input.onboardingId);
  const asked = taxIntakeQuestions(profile.profile_type, input.answers);
  const answers: TaxIntakeAnswers = {};
  for (const q of asked) (answers as any)[q] = (input.answers as any)[q];
  const routing = routeTaxIntake(profile.profile_type, answers);
  const { data: prev } = await d.from("investor_tax_facts").select("id").eq("investment_profile_id", ob.investment_profile_id).is("superseded_by", null);
  const { data: inserted, error } = await d
    .from("investor_tax_facts")
    .insert({
      investment_profile_id: ob.investment_profile_id,
      onboarding_id: ob.id,
      investor_user_id: userId,
      answers,
      routing_status: routing.status,
      form_type: routing.status === "determined" ? routing.formType : null,
      classification: routing.status === "determined" ? routing.classification : null,
      review_reason: routing.status === "needs_review" ? routing.reason : null,
    })
    .select("id")
    .single();
  if (error) fail(error.message);
  for (const p of (prev ?? []) as any[]) await d.from("investor_tax_facts").update({ superseded_by: inserted.id }).eq("id", p.id);
  if (routing.status === "needs_review") {
    await raiseOpsException(ob.id, "tax_classification_review", `Tax Classification — Needs Review: ${routing.reason}`, userId);
  }
  return routing.status === "determined"
    ? { status: "determined" as const, form: IRS_FORM_REVISIONS[routing.formType].title }
    : { status: "needs_review" as const, reason: routing.reason };
}

async function buildFill(ob: any, profile: any, person: any, routing: { formType: TaxFormType }, input: { legalName: string; tin?: string | null | undefined; foreignTin?: string | null | undefined; certifiedName: string }, signedDate: string) {
  const individual = isIndividualProfile(profile.profile_type) || profile.profile_type === "ira";
  const address = [person?.address_line1].filter(Boolean).join(" ");
  const csz = [person?.city, person?.region, person?.postal_code].filter(Boolean).join(", ");
  return {
    legalName: input.legalName.trim(),
    businessName: null,
    country: String(person?.tax_residency_country ?? person?.residence_country ?? "") || null,
    addressLine: address || null,
    cityStateZip: csz || null,
    federalClassification: routing.formType === "w9" ? w9ClassificationFor(profile.profile_type) : null,
    tinKind: individual ? ("ssn" as const) : ("ein" as const),
    tin: input.tin ?? null,
    foreignTin: input.foreignTin ?? null,
    dateOfBirth: individual ? (person?.date_of_birth ?? null) : null,
    signerName: input.certifiedName.trim(),
    signedDate,
  };
}

async function requireDeterminedRouting(userId: string, ob: any, profile: any) {
  const facts = await latestTaxFacts(ob.investment_profile_id);
  if (!facts) fail("Answer the tax questions first.");
  const routing = routeTaxIntake(profile.profile_type, facts.answers ?? {});
  if (routing.status !== "determined") {
    await raiseOpsException(ob.id, "tax_classification_review", routing.reason, userId);
    fail("Harmonious needs to confirm your tax classification before you complete a tax form.");
  }
  return { routing, factsId: facts.id };
}

/** Populate the official form for review. Returned only to the investor it belongs to. */
export async function previewTaxForm(
  userId: string,
  input: { onboardingId: string; formType: TaxFormType; legalName: string; tin?: string | null | undefined; foreignTin?: string | null | undefined; origin?: string | null },
) {
  const { d, ob, profile } = await loadOwnOnboarding(userId, input.onboardingId);
  const { routing } = await requireDeterminedRouting(userId, ob, profile);
  if (routing.formType !== input.formType) fail("That tax form does not apply to this investing profile.");
  const { person } = await loadFacts(d, ob, userId);
  const { loadOfficialTemplate, renderOfficialTaxForm } = await import("@/lib/irs-forms.server");
  const tpl = await loadOfficialTemplate(routing.formType, input.origin);
  const fill = await buildFill(ob, profile, person, routing, { ...input, certifiedName: input.legalName }, new Date().toISOString().slice(0, 10));
  const bytes = await renderOfficialTaxForm({ formType: routing.formType, template: tpl.bytes, templateSha256: tpl.sha256, fill, signature: null });
  return { pdfBase64: Buffer.from(bytes).toString("base64"), revision: IRS_FORM_REVISIONS[routing.formType].revision };
}

/** Certify & sign the populated official form. Previous forms are superseded, never overwritten. */
export async function certifyTaxForm(
  userId: string,
  input: { onboardingId: string; formType: TaxFormType; legalName: string; tin?: string | null | undefined; foreignTin?: string | null | undefined; certifiedName: string; acknowledgedRevision: string; userAgent?: string | null; origin?: string | null },
) {
  const { d, ob, profile } = await loadOwnOnboarding(userId, input.onboardingId);
  const { routing, factsId } = await requireDeterminedRouting(userId, ob, profile);
  // The server decides the form; a browser asking for another form is refused.
  if (routing.formType !== input.formType) fail("That tax form does not apply to this investing profile.");
  const rev = IRS_FORM_REVISIONS[routing.formType];
  if (input.acknowledgedRevision !== rev.revision) fail("The form revision changed. Reload and review the current form.");
  if (routing.formType === "w9" && (!input.tin || !validTin(input.tin))) fail("Enter a valid 9-digit taxpayer identification number.");
  if (input.tin && !validTin(input.tin)) fail("Enter a valid 9-digit U.S. taxpayer identification number.");
  if (input.certifiedName.trim().length < 2) fail("Type your full name to certify.");
  const { person } = await loadFacts(d, ob, userId);
  const now = new Date().toISOString();

  const { loadOfficialTemplate, renderOfficialTaxForm, sha256Hex, encryptTin } = await import("@/lib/irs-forms.server");
  const tpl = await loadOfficialTemplate(routing.formType, input.origin);
  const fill = await buildFill(ob, profile, person, routing, input, now.slice(0, 10));
  const pdf = await renderOfficialTaxForm({
    formType: routing.formType, template: tpl.bytes, templateSha256: tpl.sha256, fill,
    signature: { signerName: input.certifiedName.trim(), signedAtIso: now, profileLabel: input.legalName, classification: routing.classification, certificationMethod: "Typed-name electronic signature after review" },
  });
  const docSha = await sha256Hex(pdf);
  const path = `${ob.investment_profile_id}/${routing.formType}-${Date.now()}.pdf`;
  const { error: upErr } = await d.storage.from("tax-forms").upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (upErr) fail("The signed form could not be stored. Please try again.");

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
      tin_retained: Boolean(input.tin) && FULL_TIN_RETAINED,
      country: fill.country,
      status: "certified",
      certified_name: input.certifiedName.trim(),
      certified_at: now,
      certification_evidence: { method: "typed_name_after_review", user_agent: input.userAgent ?? null, revision: rev.revision, source: rev.sourceUrl },
      expires_on: taxFormExpiresOn(routing.formType, now),
      document_path: path,
      document_sha256: docSha,
      template_sha256: tpl.sha256,
      form_data: { classification_box: fill.federalClassification, tin_kind: input.tin ? fill.tinKind : null, country: fill.country },
      tax_facts_id: factsId,
    })
    .select("id")
    .single();
  if (error) fail(error.message);
  if (input.tin && FULL_TIN_RETAINED) {
    const enc = await encryptTin(input.tin);
    const { error: vErr } = await d.rpc("store_tax_identifier", { _form: inserted.id, _profile: ob.investment_profile_id, _ciphertext: enc.ciphertext, _iv: enc.iv, _key_version: enc.keyVersion });
    if (vErr) console.error("tax identifier vault write failed");
  }
  await d
    .from("investor_tax_forms")
    .update({ status: "superseded", superseded_by: inserted.id, superseded_at: now })
    .eq("investment_profile_id", ob.investment_profile_id)
    .neq("id", inserted.id)
    .neq("status", "superseded");
  await d.from("investor_onboarding_events").insert({
    onboarding_id: ob.id, offering_id: ob.offering_id, event: "tax_form_certified", actor_user_id: userId, actor_role: "investor",
    detail: { form_type: routing.formType, revision: rev.revision },
  }).then(() => null, () => null);
  return { ok: true };
}

/** BSA/AML answers for this investment. Review-triggering answers → Compliance Review Required. */
export async function submitAml(userId: string, input: { onboardingId: string; answers: Record<string, string>; certifiedName: string }) {
  const { d, ob, profile } = await loadOwnOnboarding(userId, input.onboardingId);
  const { person } = await loadFacts(d, ob, userId);
  const policy = await amlPolicy(ob.offering_id);
  const { data: obRow } = await d.from("investor_onboardings").select("requested_amount_cents, accepted_amount_cents").eq("id", ob.id).maybeSingle();
  const facts = {
    profileType: profile.profile_type,
    commitmentCents: Number(obRow?.accepted_amount_cents ?? obRow?.requested_amount_cents ?? 0) || null,
    known: { citizenship: person?.citizenship_country ?? null, residence: person?.residence_country ?? null, occupation: null, businessNature: null },
    answers: input.answers as any,
  };
  const ev = evaluateAml(policy, facts);
  if (!ev.complete) fail("Please answer every question shown.");
  if (input.certifiedName.trim().length < 2) fail("Type your full name to confirm.");
  const keep: Record<string, string> = {};
  for (const f of amlFields(policy, facts)) keep[f] = String(input.answers[f] ?? "").slice(0, 600);
  const id = await insertResponse(d, ob, userId, "bsa_aml", keep, input.certifiedName, ev.reviewStatus);
  if (ev.reviewStatus === "review_required") {
    await raiseOpsException(ob.id, "aml_review", `Compliance Review Required: ${ev.reasons.join("; ")}`, userId);
  }
  return { ok: true, id, reviewStatus: ev.reviewStatus };
}

/** Optional demographics. Never read by the checklist, KYC, AML, accreditation, eligibility or admission. */
export async function submitDemographics(userId: string, input: { onboardingId: string; answers: Record<string, unknown> }) {
  const { d, ob } = await loadOwnOnboarding(userId, input.onboardingId);
  const clean = sanitizeDemographics(input.answers);
  await insertResponse(d, ob, userId, "demographics", clean, "optional", "submitted");
  return { ok: true };
}

async function insertResponse(d: any, ob: any, userId: string, kind: string, answers: Record<string, unknown>, certifiedName: string, reviewStatus: string) {
  const { data: prev } = await d.from("compliance_questionnaire_responses").select("id").eq("onboarding_id", ob.id).eq("kind", kind).is("superseded_by", null);
  const { data: inserted, error } = await d
    .from("compliance_questionnaire_responses")
    .insert({
      kind, questionnaire_version: 1, onboarding_id: ob.id, offering_id: ob.offering_id,
      investment_profile_id: ob.investment_profile_id, responder_user_id: userId,
      answers, certified_name: certifiedName.trim(), review_status: reviewStatus,
    })
    .select("id")
    .single();
  if (error) fail(error.message);
  for (const p of (prev ?? []) as any[]) await d.from("compliance_questionnaire_responses").update({ superseded_by: inserted.id }).eq("id", p.id);
  return inserted.id as string;
}

/** Answer one applicable eligibility question. The server resolves the outcome. */
export async function submitEligibility(userId: string, input: { onboardingId: string; key: string; answer: "yes" | "no" | "unsure"; certifiedName: string }) {
  const { d, ob, profile } = await loadOwnOnboarding(userId, input.onboardingId);
  const { regType, rules } = await offeringRules(ob.offering_id);
  const elig = effectiveEligibility({ regType, approved: parseEligibilityConfig(rules['eligibilityRequirements']) });
  const req = elig.find((r) => r.key === input.key);
  if (!req || AUTO_EVALUATED.has(req.key)) fail("That question does not apply to this investment.");
  if (input.certifiedName.trim().length < 2) fail("Type your full name to confirm.");
  const outcome = answeredEligibility(req.key, input.answer);
  const { error } = await d.from("investor_certifications").insert({
    onboarding_id: ob.id,
    investment_profile_id: ob.investment_profile_id,
    investor_user_id: userId,
    certification_key: `eligibility:${req.key}`,
    certification_version: Date.now() % 2147483647,
    wording_status: ELIGIBILITY_WORDING_STATUS,
    certified_name: input.certifiedName.trim(),
    evidence: { answer: input.answer, satisfying: SATISFYING_ANSWER[req.key], profile_type: profile.profile_type },
  });
  if (error) fail(error.message);
  if (outcome === "needs_review") {
    await raiseOpsException(ob.id, "eligibility_review", `Eligibility needs review: ${req.key}`, userId);
  }
  return { ok: true, outcome };
}

// ================================================= HARMONIOUS STAFF ACCESS

export async function staffRoles(userId: string): Promise<string[]> {
  const d = await db();
  const { data } = await d.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}

export async function requireTaxPermission(userId: string, p: TaxPermission): Promise<string[]> {
  const roles = await staffRoles(userId);
  if (!hasTaxPermission(roles, p)) fail("Forbidden: you do not have permission for this tax or compliance record.");
  return roles;
}

/** Sensitive tax evidence: official signed PDF or full TIN. Capability-gated and audited. */
export async function staffTaxEvidence(userId: string, input: { taxFormId: string; kind: "document" | "tin"; purpose: string }) {
  const roles = await requireTaxPermission(userId, "access_sensitive_tax_records");
  const d = await db();
  const { data: form } = await d.from("investor_tax_forms").select("id, investment_profile_id, document_path, tin_retained, tin_last4").eq("id", input.taxFormId).maybeSingle();
  if (!form) fail("That tax form was not found.");
  await d.from("tax_evidence_access_events").insert({
    actor_user_id: userId, tax_form_id: form.id, investment_profile_id: form.investment_profile_id,
    access_kind: input.kind, purpose: input.purpose.slice(0, 300), actor_role: roles.includes("tax") ? "tax" : "super_admin",
  });
  if (input.kind === "document") {
    if (!form.document_path) fail("No populated form is on file for this record.");
    const { data, error } = await d.storage.from("tax-forms").createSignedUrl(form.document_path, 60);
    if (error) fail("The document could not be opened.");
    return { url: data?.signedUrl ?? null };
  }
  if (!form.tin_retained) fail("No full tax ID is retained for this record.");
  const { data: rows, error } = await d.rpc("read_tax_identifier", { _form: form.id });
  if (error || !rows?.[0]) fail("The tax ID could not be retrieved.");
  const { decryptTin } = await import("@/lib/irs-forms.server");
  return { tin: await decryptTin(rows[0].ciphertext, rows[0].iv) };
}

/** Investor opens their own signed form. */
export async function investorTaxDocumentUrl(userId: string, onboardingId: string) {
  const { d, ob } = await loadOwnOnboarding(userId, onboardingId);
  const { data } = await d.from("investor_tax_forms").select("document_path").eq("investment_profile_id", ob.investment_profile_id).eq("investor_user_id", userId).neq("status", "superseded").order("certified_at", { ascending: false }).limit(1);
  const path = data?.[0]?.document_path;
  if (!path) fail("No signed tax form yet.");
  const { data: signed } = await d.storage.from("tax-forms").createSignedUrl(path, 60);
  return { url: signed?.signedUrl ?? null };
}

// ======================================== FUND ELIGIBILITY CONFIGURATION

async function setupFor(offeringId: string) {
  const d = await db();
  const [{ data: setup }, { data: offering }] = await Promise.all([
    d.from("fund_setups").select("id").eq("offering_id", offeringId).maybeSingle(),
    d.from("offerings").select("id, name, reg_type").eq("id", offeringId).maybeSingle(),
  ]);
  if (!offering) fail("Fund not found.");
  return { d, setupId: (setup?.id ?? null) as string | null, offering };
}

export async function getEligibilitySetup(userId: string, offeringId: string) {
  const roles = await requireTaxPermission(userId, "configure_fund_eligibility");
  const { d, setupId, offering } = await setupFor(offeringId);
  if (!setupId) return { available: false as const, fundName: offering.name, permissions: taxPermissions(roles) };
  const { data: rows } = await d.from("fund_eligibility_configs").select("id, version, status, rules, created_by, approved_at").eq("setup_id", setupId).order("version", { ascending: false });
  const list = (rows ?? []) as any[];
  const approved = list.find((c) => c.status === "approved") ?? null;
  const draft = list.find((c) => c.status === "draft") ?? null;
  return {
    available: true as const,
    fundName: offering.name,
    regType: offering.reg_type as string | null,
    permissions: taxPermissions(roles),
    mandatory: effectiveEligibility({ regType: offering.reg_type, approved: [] }).map((r) => r.key),
    approved: approved ? { id: approved.id, version: approved.version, requirements: parseEligibilityConfig(approved.rules?.eligibilityRequirements) } : null,
    draft: draft ? { id: draft.id, version: draft.version, requirements: parseEligibilityConfig(draft.rules?.eligibilityRequirements), preparedByMe: draft.created_by === userId } : null,
  };
}

export async function saveEligibilityDraft(userId: string, input: { offeringId: string; requirements: unknown }) {
  await requireTaxPermission(userId, "configure_fund_eligibility");
  const { d, setupId, offering } = await setupFor(input.offeringId);
  if (!setupId) fail("This fund has no setup record yet.");
  const reqs = parseEligibilityConfig(input.requirements);
  // Mandatory regulatory requirements can never be removed or weakened.
  const effective = effectiveEligibility({ regType: offering.reg_type, approved: reqs });
  const { data: rows } = await d.from("fund_eligibility_configs").select("id, version, status, rules").eq("setup_id", setupId);
  const list = (rows ?? []) as any[];
  const approved = list.find((c) => c.status === "approved");
  const rules = { ...(approved?.rules ?? {}), eligibilityRequirements: effective };
  const draft = list.find((c) => c.status === "draft");
  if (draft) {
    const { error } = await d.from("fund_eligibility_configs").update({ rules, created_by: userId, updated_at: new Date().toISOString() }).eq("id", draft.id);
    if (error) fail(error.message);
    return { id: draft.id };
  }
  const version = Math.max(0, ...list.map((c) => Number(c.version ?? 0))) + 1;
  const { data, error } = await d.from("fund_eligibility_configs").insert({ setup_id: setupId, version, status: "draft", rules, supersedes_id: approved?.id ?? null, created_by: userId }).select("id").single();
  if (error) fail(error.message);
  return { id: data.id };
}

/** Maker-checker: the person who prepared the draft cannot approve it. */
export async function approveEligibilityDraft(userId: string, input: { offeringId: string; draftId: string }) {
  await requireTaxPermission(userId, "approve_compliance_exceptions");
  const { d, setupId } = await setupFor(input.offeringId);
  const { data: draft } = await d.from("fund_eligibility_configs").select("id, setup_id, status, created_by").eq("id", input.draftId).maybeSingle();
  if (!draft || draft.setup_id !== setupId || draft.status !== "draft") fail("That draft was not found.");
  if (draft.created_by === userId) fail("Someone other than the preparer must approve these requirements.");
  const now = new Date().toISOString();
  await d.from("fund_eligibility_configs").update({ status: "superseded", updated_at: now }).eq("setup_id", setupId).eq("status", "approved");
  const { error } = await d.from("fund_eligibility_configs").update({ status: "approved", approved_by: userId, approved_at: now, updated_at: now }).eq("id", draft.id);
  if (error) fail(error.message);
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
