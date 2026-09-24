/**
 * Stage 2 rules for the ONE authoritative onboarding checklist:
 * tax documentation, Bad Actor (Rule 506(d)), offering-specific eligibility
 * and investor certifications. Pure and deny-by-default; the server supplies
 * facts, this module decides. The browser never decides what applies.
 */

// ================================================================== TAX

export type TaxFormType = "w9" | "w8ben" | "w8bene" | "w8eci" | "w8exp" | "w8imy";

export interface IrsFormRevision {
  formType: TaxFormType;
  title: string;
  revision: string;
  sourceUrl: string;
  /** SHA-256 of the exact official PDF used as the template. */
  templateSha256: string;
  status: "current" | "retired";
  verifiedOn: string;
}

/**
 * Official IRS forms, versioned configuration. Verified against irs.gov on
 * 2026-09-24. Each completed record stores revision + template hash, so a
 * future revision is added here (and the old one marked retired) without
 * touching completed records.
 */
export const IRS_FORM_CATALOG: IrsFormRevision[] = [
  { formType: "w9", title: "Form W-9", revision: "Rev. March 2024", sourceUrl: "https://www.irs.gov/pub/irs-pdf/fw9.pdf", templateSha256: "2d420cbb4123dcf1fb82595b2359cfbb5d81f00b9df9d359fcc7af361d093f53", status: "current", verifiedOn: "2026-09-24" },
  { formType: "w8ben", title: "Form W-8BEN", revision: "Rev. October 2021", sourceUrl: "https://www.irs.gov/pub/irs-pdf/fw8ben.pdf", templateSha256: "b821dc1172c91b348a65675529cc792782f11fc1ae8579df92d627113203f918", status: "current", verifiedOn: "2026-09-24" },
  { formType: "w8bene", title: "Form W-8BEN-E", revision: "Rev. October 2021", sourceUrl: "https://www.irs.gov/pub/irs-pdf/fw8bene.pdf", templateSha256: "d67fc5abae5af11df5d6168a60f7a7e7f27044efa63f660cb76c0e47a241ef6e", status: "current", verifiedOn: "2026-09-24" },
  { formType: "w8eci", title: "Form W-8ECI", revision: "Rev. October 2021", sourceUrl: "https://www.irs.gov/pub/irs-pdf/fw8eci.pdf", templateSha256: "e8fd980376228d3636498889c4ace387055190226fffafcdbfc2e9c88c8b1f31", status: "current", verifiedOn: "2026-09-24" },
  { formType: "w8exp", title: "Form W-8EXP", revision: "Rev. October 2023", sourceUrl: "https://www.irs.gov/pub/irs-pdf/fw8exp.pdf", templateSha256: "c3d48afbd34a08aeb81cee280e1645a84bc06f0351c20704f7dd98694d736475", status: "current", verifiedOn: "2026-09-24" },
  { formType: "w8imy", title: "Form W-8IMY", revision: "Rev. October 2021", sourceUrl: "https://www.irs.gov/pub/irs-pdf/fw8imy.pdf", templateSha256: "2d3048e7d83485dde66e8d7904411cf577e5d2f73c71541c804d9dcb1bfb0493", status: "current", verifiedOn: "2026-09-24" },
];

export function currentIrsForm(formType: TaxFormType): IrsFormRevision {
  const f = IRS_FORM_CATALOG.find((r) => r.formType === formType && r.status === "current");
  if (!f) throw new Error(`No current IRS revision configured for ${formType}`);
  return f;
}

export const IRS_FORM_REVISIONS: Record<TaxFormType, IrsFormRevision> = Object.fromEntries(
  (["w9", "w8ben", "w8bene", "w8eci", "w8exp", "w8imy"] as TaxFormType[]).map((t) => [t, currentIrsForm(t)]),
) as Record<TaxFormType, IrsFormRevision>;
export const TAX_REVISIONS_VERIFIED = true;

export interface TaxFacts {
  profileType: string | null | undefined;
  /** true = U.S. person, false = foreign, null = not yet known. */
  usPerson: boolean | null | undefined;
  claimsEffectivelyConnectedIncome?: boolean | null;
  foreignGovernmentOrExempt?: boolean | null;
  intermediaryOrFlowThrough?: boolean | null;
}

export type TaxRouting =
  | { status: "determined"; formType: TaxFormType; classification: string }
  | { status: "needs_review"; reason: string };

const INDIVIDUAL_LIKE = new Set(["individual", "joint"]);
const ENTITY_LIKE = new Set(["llc", "corporation", "partnership", "trust", "family_office", "foundation", "other_entity"]);
const RETIREMENT = new Set(["ira", "retirement_plan"]);

/** Resolve which tax form applies. Insufficient facts → review, never a guess. */
export function resolveTaxForm(f: TaxFacts): TaxRouting {
  const type = String(f.profileType ?? "");
  if (!type || (!INDIVIDUAL_LIKE.has(type) && !ENTITY_LIKE.has(type) && !RETIREMENT.has(type))) {
    return { status: "needs_review", reason: "The investing profile type is not known yet." };
  }
  if (f.usPerson === null || f.usPerson === undefined) {
    return { status: "needs_review", reason: "We can't yet tell whether this investor is a U.S. person for tax purposes." };
  }
  if (f.usPerson) {
    return { status: "determined", formType: "w9", classification: `us_${type}` };
  }
  // Foreign. Flags are mutually exclusive paths; more than one → review.
  const flags = [f.intermediaryOrFlowThrough, f.foreignGovernmentOrExempt, f.claimsEffectivelyConnectedIncome].filter(Boolean).length;
  if (flags > 1) return { status: "needs_review", reason: "More than one W-8 path could apply." };
  if (RETIREMENT.has(type)) {
    return { status: "needs_review", reason: "Foreign retirement accounts need Harmonious to confirm the right form." };
  }
  if (f.intermediaryOrFlowThrough) {
    if (INDIVIDUAL_LIKE.has(type)) return { status: "needs_review", reason: "An individual cannot act as an intermediary." };
    return { status: "determined", formType: "w8imy", classification: `foreign_${type}_intermediary` };
  }
  if (f.foreignGovernmentOrExempt) {
    if (INDIVIDUAL_LIKE.has(type)) return { status: "needs_review", reason: "Exempt-organization status does not apply to individuals." };
    return { status: "determined", formType: "w8exp", classification: `foreign_${type}_exempt` };
  }
  if (f.claimsEffectivelyConnectedIncome) {
    return { status: "determined", formType: "w8eci", classification: `foreign_${type}_eci` };
  }
  if (INDIVIDUAL_LIKE.has(type)) return { status: "determined", formType: "w8ben", classification: `foreign_${type}` };
  return { status: "determined", formType: "w8bene", classification: `foreign_${type}` };
}

/** W-8s generally stay valid until the last day of the third calendar year after signing. W-9 has no fixed expiry. */
export function taxFormExpiresOn(formType: TaxFormType, certifiedAtIso: string): string | null {
  if (formType === "w9") return null;
  const y = new Date(certifiedAtIso).getUTCFullYear();
  return `${y + 3}-12-31`;
}

export interface StoredTaxForm {
  id?: string;
  investment_profile_id: string;
  form_type: string;
  classification: string;
  status: string;
  tin_fingerprint?: string | null;
  legal_name?: string | null;
  expires_on?: string | null;
  certified_at?: string | null;
}

/** Reuse only for the SAME profile, form, classification, TIN and legal name, unexpired and certified. */
export function canReuseTaxForm(
  form: StoredTaxForm,
  want: { profileId: string; formType: string; classification: string; tinFingerprint?: string | null; legalName?: string | null; nowIso: string },
): boolean {
  if (form.status !== "certified") return false;
  if (form.investment_profile_id !== want.profileId) return false;
  if (form.form_type !== want.formType) return false;
  if (form.classification !== want.classification) return false;
  if (want.tinFingerprint && form.tin_fingerprint && want.tinFingerprint !== form.tin_fingerprint) return false;
  if (want.legalName && form.legal_name && want.legalName.trim().toLowerCase() !== form.legal_name.trim().toLowerCase()) return false;
  if (form.expires_on && form.expires_on < want.nowIso.slice(0, 10)) return false;
  return true;
}

export type ChecklistState = "valid" | "refresh_required" | "missing" | "review_required" | "not_applicable";

export function taxRequirementState(input: {
  required: boolean;
  routing: TaxRouting;
  profileId: string | null | undefined;
  forms: StoredTaxForm[];
  nowIso: string;
}): { state: ChecklistState; reason?: string } {
  if (!input.required) return { state: "not_applicable" };
  if (!input.profileId) return { state: "missing" };
  const mine = input.forms.filter((f) => f.investment_profile_id === input.profileId);
  if (mine.some((f) => f.status === "needs_review")) return { state: "review_required", reason: "Harmonious is reviewing your tax information." };
  if (input.routing.status === "needs_review") return { state: "review_required", reason: input.routing.reason };
  const routing = input.routing;
  const match = mine.find((f) =>
    canReuseTaxForm(f, { profileId: input.profileId!, formType: routing.formType, classification: routing.classification, nowIso: input.nowIso }),
  );
  if (match) return { state: "valid" };
  const stale = mine.find((f) => f.status === "certified" && f.form_type === routing.formType);
  if (stale) return { state: "refresh_required", reason: "Your tax form needs to be renewed." };
  return { state: "missing", reason: `Complete ${IRS_FORM_REVISIONS[routing.formType].title}.` };
}

export const MANAGER_TAX_LABELS = ["Tax — Required", "Tax — In Progress", "Tax — Complete", "Tax — Needs Attention"] as const;
export function managerTaxLabel(state: ChecklistState | string): (typeof MANAGER_TAX_LABELS)[number] | "Tax — Not needed" {
  if (state === "valid") return "Tax — Complete";
  if (state === "not_applicable") return "Tax — Not needed";
  if (state === "review_required" || state === "refresh_required") return "Tax — Needs Attention";
  return "Tax — Required";
}

export function tinLast4(tin: string): string | null {
  const d = String(tin ?? "").replace(/\D/g, "");
  return d.length === 9 ? d.slice(-4) : null;
}
export function validTin(tin: string): boolean {
  return /^\d{9}$/.test(String(tin ?? "").replace(/\D/g, ""));
}
export function maskTin(last4: string | null | undefined): string {
  return last4 ? `•••-••-${last4}` : "Not on file";
}

// ============================================================ BAD ACTOR

/**
 * Structure follows the Rule 506(d)(1)(i)–(viii) disqualifying-event
 * categories. Headings are neutral category names, NOT question wording.
 * Final questions must come from Harmonious legal/compliance.
 */
export const BAD_ACTOR_CATEGORIES = [
  { key: "506d_1_i", heading: "Criminal convictions (Rule 506(d)(1)(i))" },
  { key: "506d_1_ii", heading: "Court injunctions and restraining orders (Rule 506(d)(1)(ii))" },
  { key: "506d_1_iii", heading: "Final orders of certain regulators (Rule 506(d)(1)(iii))" },
  { key: "506d_1_iv", heading: "SEC disciplinary orders (Rule 506(d)(1)(iv))" },
  { key: "506d_1_v", heading: "SEC cease-and-desist orders (Rule 506(d)(1)(v))" },
  { key: "506d_1_vi", heading: "Self-regulatory organization suspension or expulsion (Rule 506(d)(1)(vi))" },
  { key: "506d_1_vii", heading: "SEC stop orders and orders suspending Regulation A (Rule 506(d)(1)(vii))" },
  { key: "506d_1_viii", heading: "U.S. Postal Service false representation orders (Rule 506(d)(1)(viii))" },
] as const;
export const BAD_ACTOR_QUESTIONNAIRE_VERSION = 1;
export const BAD_ACTOR_WORDING_STATUS = "approval_required" as const;

export const COVERED_PERSON_ROLES = [
  "issuer_related",
  "director",
  "officer",
  "general_partner",
  "managing_member",
  "manager",
  "promoter",
  "beneficial_owner_20pct",
  "compensated_solicitor",
] as const;

export interface BadActorConfig {
  required?: boolean;
  /** Which relationships make someone a covered person for THIS offering. */
  coveredRoles?: string[];
  /** Offering chose to ask every investor (e.g. conservative issuer policy). */
  applyToAllInvestors?: boolean;
}

export function badActorApplies(config: BadActorConfig | null | undefined, roles: readonly string[]): boolean {
  if (!config?.required) return false;
  if (config.applyToAllInvestors) return true;
  const covered = config.coveredRoles?.length ? config.coveredRoles : [...COVERED_PERSON_ROLES];
  return roles.some((r) => covered.includes(r));
}

export type BadActorAnswer = "yes" | "no";
/** Any "yes" goes to human review. Nothing here ever approves or rejects. */
export function evaluateBadActor(answers: Record<string, unknown>): { complete: boolean; reviewStatus: "submitted" | "review_required" } {
  const keys = BAD_ACTOR_CATEGORIES.map((c) => c.key);
  const complete = keys.every((k) => answers[k] === "yes" || answers[k] === "no");
  const anyYes = keys.some((k) => answers[k] === "yes");
  return { complete, reviewStatus: anyYes ? "review_required" : "submitted" };
}

export function badActorRequirementState(input: {
  applies: boolean;
  latest: { review_status: string } | null | undefined;
}): { state: ChecklistState; reason?: string } {
  if (!input.applies) return { state: "not_applicable" };
  const s = input.latest?.review_status;
  if (!s) return { state: "missing" };
  if (s === "submitted" || s === "cleared") return { state: "valid" };
  return { state: "review_required", reason: "Compliance Review Required" };
}

// ======================================================= ELIGIBILITY

export const ELIGIBILITY_CATEGORIES = ["regulatory", "fund", "representation"] as const;
export type EligibilityCategory = (typeof ELIGIBILITY_CATEGORIES)[number];

export const ELIGIBILITY_REQUIREMENT_TYPES = {
  accredited_investor: { label: "Accredited investor", category: "regulatory" },
  qualified_purchaser: { label: "Qualified purchaser", category: "regulatory" },
  qualified_client: { label: "Qualified client", category: "regulatory" },
  erisa_benefit_plan: { label: "ERISA / benefit-plan investor status", category: "representation" },
  investment_company_status: { label: "Investment-company status", category: "representation" },
  purchaser_representative: { label: "Purchaser representative", category: "representation" },
  investment_intent: { label: "Investment intent", category: "representation" },
  authority_capacity: { label: "Authority / capacity to invest", category: "representation" },
  finra_affiliation: { label: "Industry / FINRA affiliation", category: "representation" },
  minimum_investment: { label: "Minimum investment", category: "fund" },
  investor_type_restriction: { label: "Investor-type restriction", category: "fund" },
  jurisdiction_restriction: { label: "Jurisdiction restriction", category: "fund" },
  custom_representation: { label: "Approved custom representation", category: "representation" },
} as const satisfies Record<string, { label: string; category: EligibilityCategory }>;
export type EligibilityRequirementType = keyof typeof ELIGIBILITY_REQUIREMENT_TYPES;

export interface EligibilityRequirementConfig {
  key: EligibilityRequirementType;
  category: EligibilityCategory;
  mandatory: boolean;
  /** When true a "yes/flag" response routes to review instead of satisfying. */
  reviewOnFlag?: boolean | undefined;
  params?: {
    minimumCents?: number | null;
    allowedProfileTypes?: string[];
    blockedCountries?: string[];
    allowedCountries?: string[];
    customText?: string;
  } | undefined;
}

export const ELIGIBILITY_OUTCOMES = [
  "not_started", "in_progress", "submitted", "satisfied", "needs_information", "needs_review", "not_applicable",
] as const;
export type EligibilityOutcome = (typeof ELIGIBILITY_OUTCOMES)[number];

/** Requirements the exemption itself imposes. Nobody can switch these off. */
export function mandatoryForExemption(regType: string | null | undefined): EligibilityRequirementConfig[] {
  if (String(regType ?? "") === "506c") {
    return [{ key: "accredited_investor", category: "regulatory", mandatory: true }];
  }
  return [];
}

/**
 * Harmonious-approved configuration + manager additions. A manager may add
 * requirements but can never remove or weaken a mandatory one.
 */
export function effectiveEligibility(input: {
  regType: string | null | undefined;
  approved: EligibilityRequirementConfig[];
  managerProposed?: EligibilityRequirementConfig[];
}): EligibilityRequirementConfig[] {
  const byKey = new Map<string, EligibilityRequirementConfig>();
  for (const r of [...mandatoryForExemption(input.regType), ...input.approved]) {
    const prev = byKey.get(r.key);
    byKey.set(r.key, prev ? { ...r, mandatory: prev.mandatory || r.mandatory } : r);
  }
  for (const r of input.managerProposed ?? []) {
    const prev = byKey.get(r.key);
    if (prev) {
      byKey.set(r.key, { ...prev, mandatory: prev.mandatory || r.mandatory, reviewOnFlag: prev.reviewOnFlag || r.reviewOnFlag });
    } else {
      byKey.set(r.key, r);
    }
  }
  return [...byKey.values()].filter((r) => r.key in ELIGIBILITY_REQUIREMENT_TYPES);
}

const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => String(x).trim()).filter(Boolean).slice(0, 200) : undefined);

export function parseEligibilityConfig(raw: unknown): EligibilityRequirementConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r: any) => r && typeof r.key === "string" && r.key in ELIGIBILITY_REQUIREMENT_TYPES)
    .map((r: any) => {
      const p = r.params ?? {};
      const params: NonNullable<EligibilityRequirementConfig["params"]> = {};
      if (Number.isFinite(Number(p.minimumCents)) && p.minimumCents !== null && p.minimumCents !== "") params.minimumCents = Math.max(0, Math.round(Number(p.minimumCents)));
      const apt = strList(p.allowedProfileTypes); if (apt) params.allowedProfileTypes = apt;
      const bc = strList(p.blockedCountries); if (bc) params.blockedCountries = bc.map((c) => c.toUpperCase());
      const ac = strList(p.allowedCountries); if (ac) params.allowedCountries = ac.map((c) => c.toUpperCase());
      if (typeof p.customText === "string" && p.customText.trim()) params.customText = p.customText.trim().slice(0, 1000);
      return {
        key: r.key,
        category: (ELIGIBILITY_REQUIREMENT_TYPES as any)[r.key].category,
        mandatory: r.mandatory !== false,
        reviewOnFlag: Boolean(r.reviewOnFlag),
        params,
      };
    });
}

/** "accredited_investor" is resolved by the accreditation requirement itself. */
export function eligibilityOutcome(
  req: EligibilityRequirementConfig,
  response: { value?: string | null; reviewStatus?: string | null } | undefined,
): EligibilityOutcome {
  if (req.key === "accredited_investor") return "not_applicable";
  if (!response?.value) return req.mandatory ? "not_started" : "not_applicable";
  if (response.reviewStatus === "needs_information") return "needs_information";
  if (response.reviewStatus === "cleared") return "satisfied";
  if (response.value === "flag" && req.reviewOnFlag) return "needs_review";
  if (response.value === "flag") return "needs_review";
  return "satisfied";
}

export function eligibilityChecklistState(outcomes: EligibilityOutcome[]): ChecklistState {
  const relevant = outcomes.filter((o) => o !== "not_applicable");
  if (relevant.length === 0) return "not_applicable";
  if (relevant.every((o) => o === "satisfied")) return "valid";
  if (relevant.some((o) => o === "needs_review" || o === "submitted")) return "review_required";
  return "missing";
}

// ===================================================== CERTIFICATIONS

export const CERTIFICATIONS = {
  accuracy: { version: 1, heading: "Accuracy and completeness of the information I supplied" },
  authority_capacity: { version: 1, heading: "Authority and capacity to invest on behalf of this investing profile" },
  offering_representations: { version: 1, heading: "Offering representations for this fund" },
  electronic_records: { version: 1, heading: "Consent to electronic records and signatures" },
  privacy_terms: { version: 1, heading: "Privacy notice and terms acknowledgement" },
} as const;
export type CertificationKey = keyof typeof CERTIFICATIONS;
/** All certification wording is pending legal/compliance approval. */
export const CERTIFICATION_WORDING_STATUS = "approval_required" as const;

export function requiredCertifications(input: {
  isEntityOrDelegated: boolean;
  hasOfferingRepresentations: boolean;
}): CertificationKey[] {
  const out: CertificationKey[] = ["accuracy", "electronic_records", "privacy_terms"];
  if (input.isEntityOrDelegated) out.splice(1, 0, "authority_capacity");
  if (input.hasOfferingRepresentations) out.push("offering_representations");
  return out;
}

export function certificationState(
  required: CertificationKey[],
  given: { certification_key: string; certification_version: number }[],
): { state: ChecklistState; missing: CertificationKey[] } {
  const missing = required.filter(
    (k) => !given.some((g) => g.certification_key === k && g.certification_version === CERTIFICATIONS[k].version),
  );
  return { state: missing.length ? "missing" : "valid", missing };
}

// ========================================================= MANAGER VIEW

/** Manager-safe status words. No answers, identifiers or evidence. */
export function managerComplianceLabel(state: ChecklistState | string): string {
  if (state === "valid") return "Complete";
  if (state === "not_applicable") return "Not needed";
  if (state === "review_required") return "Compliance Review Required";
  return "Required";
}
