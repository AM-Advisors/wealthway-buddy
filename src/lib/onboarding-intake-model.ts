/**
 * Stage 3 pure rules for the ONE authoritative onboarding checklist:
 * tax-classification intake, BSA/AML questions, optional demographics,
 * offering eligibility answers and granular Harmonious tax permissions.
 * The server supplies facts; this module decides. The browser never does.
 */
import { resolveTaxForm, type TaxRouting } from "@/lib/onboarding-compliance-model";
import type { ChecklistState, EligibilityOutcome } from "@/lib/onboarding-compliance-model";

// ============================================================ TAX INTAKE

export type YesNoUnsure = "yes" | "no" | "unsure";
export type ActingCapacity = "beneficial_owner" | "intermediary" | "flow_through" | "branch" | "unsure";
export type ExemptStatus =
  | "none"
  | "foreign_government"
  | "international_organization"
  | "foreign_central_bank"
  | "foreign_tax_exempt_organization"
  | "foreign_private_foundation"
  | "government_of_us_possession"
  | "unsure";

export interface TaxIntakeAnswers {
  usPerson?: YesNoUnsure | undefined;
  citizenshipCountry?: string | undefined;
  taxResidenceCountry?: string | undefined;
  capacity?: ActingCapacity | undefined;
  exemptStatus?: ExemptStatus | undefined;
  effectivelyConnected?: YesNoUnsure | undefined;
}

const INDIVIDUAL_LIKE = new Set(["individual", "joint"]);
export const isIndividualProfile = (type: string | null | undefined) => INDIVIDUAL_LIKE.has(String(type ?? ""));

export type TaxQuestionKey = keyof TaxIntakeAnswers;

/** The adaptive question list: only what is needed to resolve the form. */
export function taxIntakeQuestions(profileType: string | null | undefined, a: TaxIntakeAnswers): TaxQuestionKey[] {
  const out: TaxQuestionKey[] = ["usPerson"];
  if (a.usPerson !== "no") return out;
  out.push("taxResidenceCountry");
  if (isIndividualProfile(profileType)) {
    out.push("citizenshipCountry", "effectivelyConnected");
    return out;
  }
  out.push("capacity");
  if (a.capacity === "beneficial_owner") out.push("exemptStatus");
  if (a.capacity === "beneficial_owner" && a.exemptStatus === "none") out.push("effectivelyConnected");
  return out;
}

const upper = (s: string | undefined) => String(s ?? "").trim().toUpperCase();

/**
 * Turn factual answers into a routing. Anything unsure, contradictory or
 * outside the supported rules becomes Needs Review, never a guess.
 */
export function routeTaxIntake(profileType: string | null | undefined, a: TaxIntakeAnswers): TaxRouting {
  const asked = taxIntakeQuestions(profileType, a);
  for (const q of asked) {
    const v = a[q];
    if (v === undefined || v === "") return { status: "needs_review", reason: "Some tax questions are unanswered." };
    if (v === "unsure") {
      return { status: "needs_review", reason: "You weren't sure about one of the tax questions. Harmonious will follow up; you may wish to ask your tax adviser." };
    }
  }
  if (a.usPerson === "yes") return resolveTaxForm({ profileType, usPerson: true });

  // Foreign. Contradictions go to people.
  if (upper(a.taxResidenceCountry) === "US" || upper(a.taxResidenceCountry) === "UNITED STATES") {
    return { status: "needs_review", reason: "You said you are not a U.S. person but listed the United States as your tax residence." };
  }
  if (isIndividualProfile(profileType) && (upper(a.citizenshipCountry) === "US" || upper(a.citizenshipCountry) === "UNITED STATES")) {
    return { status: "needs_review", reason: "U.S. citizens are generally U.S. persons for tax purposes. Harmonious will confirm this with you." };
  }
  const exempt = a.exemptStatus && a.exemptStatus !== "none";
  if (a.exemptStatus === "foreign_private_foundation" || a.exemptStatus === "government_of_us_possession") {
    return { status: "needs_review", reason: "This organization type needs Harmonious to confirm the right form." };
  }
  return resolveTaxForm({
    profileType,
    usPerson: false,
    intermediaryOrFlowThrough: a.capacity === "intermediary" || a.capacity === "flow_through" || a.capacity === "branch",
    foreignGovernmentOrExempt: Boolean(exempt),
    claimsEffectivelyConnectedIncome: a.effectivelyConnected === "yes",
  });
}

// ============================================================== IRS FORMS

/** Map certified, non-sensitive details onto the official AcroForm fields. */
export interface TaxFormFill {
  legalName: string;
  businessName?: string | null | undefined;
  country?: string | null | undefined;
  addressLine?: string | null | undefined;
  cityStateZip?: string | null | undefined;
  federalClassification?: "individual" | "c_corp" | "s_corp" | "partnership" | "trust" | "llc" | "other" | null | undefined;
  llcClass?: "C" | "S" | "P" | null | undefined;
  tinKind?: "ssn" | "ein" | null | undefined;
  /** Digits only. Used only to draw the form, never stored in form_data. */
  tin?: string | null | undefined;
  foreignTin?: string | null | undefined;
  dateOfBirth?: string | null | undefined;
  signerName: string;
  signedDate: string;
}

const P = "topmostSubform[0].Page1[0].";
export function irsFieldValues(formType: string, f: TaxFormFill): { text: Record<string, string>; checks: string[] } {
  const text: Record<string, string> = {};
  const checks: string[] = [];
  const tin = String(f.tin ?? "").replace(/\D/g, "");
  if (formType === "w9") {
    text[`${P}f1_01[0]`] = f.legalName;
    if (f.businessName) text[`${P}f1_02[0]`] = f.businessName;
    const idx = { individual: 0, c_corp: 1, s_corp: 2, partnership: 3, trust: 4, llc: 5, other: 6 } as const;
    if (f.federalClassification) checks.push(`${P}Boxes3a-b_ReadOrder[0].c1_1[${idx[f.federalClassification]}]`);
    if (f.federalClassification === "llc" && f.llcClass) text[`${P}Boxes3a-b_ReadOrder[0].f1_03[0]`] = f.llcClass;
    if (f.addressLine) text[`${P}Address_ReadOrder[0].f1_07[0]`] = f.addressLine;
    if (f.cityStateZip) text[`${P}Address_ReadOrder[0].f1_08[0]`] = f.cityStateZip;
    if (tin.length === 9 && f.tinKind === "ssn") {
      text[`${P}f1_11[0]`] = tin.slice(0, 3);
      text[`${P}f1_12[0]`] = tin.slice(3, 5);
      text[`${P}f1_13[0]`] = tin.slice(5);
    } else if (tin.length === 9 && f.tinKind === "ein") {
      text[`${P}f1_14[0]`] = tin.slice(0, 2);
      text[`${P}f1_15[0]`] = tin.slice(2);
    }
    return { text, checks };
  }
  if (formType === "w8ben") {
    text[`${P}f_1[0]`] = f.legalName;
    if (f.country) text[`${P}f_2[0]`] = f.country;
    if (f.addressLine) text[`${P}f_3[0]`] = f.addressLine;
    if (f.cityStateZip) text[`${P}f_4[0]`] = f.cityStateZip;
    if (f.country) text[`${P}f_5[0]`] = f.country;
    if (tin.length === 9) text[`${P}f_9[0]`] = tin;
    if (f.foreignTin) text[`${P}f_10[0]`] = f.foreignTin;
    if (f.dateOfBirth) text[`${P}f_12[0]`] = f.dateOfBirth;
    text[`${P}Date[0]`] = f.signedDate;
    text[`${P}f_21[0]`] = f.signerName;
    return { text, checks };
  }
  // W-8BEN-E, W-8ECI, W-8EXP, W-8IMY: Part I line 1 name and line 2 country.
  text[`${P}f1_1[0]`] = f.legalName;
  if (f.country) text[`${P}f1_2[0]`] = f.country;
  return { text, checks };
}

/** Which W-9 federal tax classification box a profile type implies. */
export function w9ClassificationFor(profileType: string | null | undefined): TaxFormFill["federalClassification"] {
  switch (String(profileType ?? "")) {
    case "individual":
    case "joint":
    case "ira":
      return "individual";
    case "corporation":
      return "c_corp";
    case "partnership":
      return "partnership";
    case "trust":
      return "trust";
    case "llc":
      return "llc";
    default:
      return "other";
  }
}

/**
 * Full-TIN retention decision. Harmonious prepares K-1s and information
 * returns, which need the payee's full TIN, so it is retained — encrypted,
 * outside the Data API, readable only with the sensitive-tax capability.
 */
export const FULL_TIN_RETAINED = true;

// ================================================================ BSA / AML

export const SOURCE_OF_FUNDS = [
  { value: "employment_income", label: "Employment income" },
  { value: "business_proceeds", label: "Business proceeds" },
  { value: "investment_returns", label: "Investment returns" },
  { value: "sale_of_asset", label: "Sale of an asset" },
  { value: "inheritance_gift", label: "Inheritance or gift" },
  { value: "retirement_savings", label: "Retirement savings" },
  { value: "other", label: "Other" },
] as const;
export type SourceOfFunds = (typeof SOURCE_OF_FUNDS)[number]["value"];

export const SOURCE_OF_WEALTH = [
  { value: "career_earnings", label: "Career earnings" },
  { value: "business_ownership", label: "Business ownership or sale" },
  { value: "investments", label: "Investments" },
  { value: "inheritance", label: "Inheritance" },
  { value: "real_estate", label: "Real estate" },
  { value: "other", label: "Other" },
] as const;

export interface AmlPolicy {
  /** Enhanced due diligence at or above this commitment. null = no amount trigger. */
  eddThresholdCents?: number | null;
  highRiskCountries?: string[];
}

export interface AmlFacts {
  profileType: string | null | undefined;
  commitmentCents: number | null | undefined;
  /** Already known from the person / profile; not asked again. */
  known: { citizenship?: string | null; residence?: string | null; occupation?: string | null; businessNature?: string | null };
  answers?: Partial<AmlAnswers> | undefined;
}

export interface AmlAnswers {
  citizenship: string;
  residence: string;
  occupation: string;
  businessNature: string;
  sourceOfFunds: SourceOfFunds;
  sourceOfFundsDetail: string;
  fundsOriginCountry: string;
  thirdPartyFunding: "yes" | "no";
  politicallyExposed: "yes" | "no";
  expectedActivity: "single_investment" | "ongoing";
  sourceOfWealth: string;
  sourceOfWealthDetail: string;
}

export type AmlField = keyof AmlAnswers;

export function amlEnhanced(policy: AmlPolicy, facts: AmlFacts): boolean {
  const a = facts.answers ?? {};
  if (a.politicallyExposed === "yes") return true;
  const hr = (policy.highRiskCountries ?? []).map((c) => c.toUpperCase());
  const countries = [a.residence, a.citizenship, a.fundsOriginCountry, facts.known.residence, facts.known.citizenship].map((c) => String(c ?? "").toUpperCase());
  if (hr.length && countries.some((c) => c && hr.includes(c))) return true;
  if (policy.eddThresholdCents != null && Number(facts.commitmentCents ?? 0) >= policy.eddThresholdCents) return true;
  return false;
}

/** Fields to ask. Known facts are reused, not asked twice. */
export function amlFields(policy: AmlPolicy, facts: AmlFacts): AmlField[] {
  const out: AmlField[] = [];
  const individual = isIndividualProfile(facts.profileType);
  if (individual) {
    if (!facts.known.citizenship) out.push("citizenship");
    if (!facts.known.residence) out.push("residence");
    if (!facts.known.occupation) out.push("occupation");
  } else if (!facts.known.businessNature) {
    out.push("businessNature");
  }
  out.push("sourceOfFunds");
  if (facts.answers?.sourceOfFunds === "other") out.push("sourceOfFundsDetail");
  out.push("fundsOriginCountry", "thirdPartyFunding", "politicallyExposed", "expectedActivity");
  if (amlEnhanced(policy, facts)) out.push("sourceOfWealth", "sourceOfWealthDetail");
  return out;
}

export function evaluateAml(policy: AmlPolicy, facts: AmlFacts): { complete: boolean; missing: AmlField[]; reviewStatus: "submitted" | "review_required"; reasons: string[] } {
  const a = (facts.answers ?? {}) as Partial<AmlAnswers>;
  const fields = amlFields(policy, facts);
  const missing = fields.filter((f) => !String(a[f] ?? "").trim());
  const reasons: string[] = [];
  if (a.sourceOfFunds === "other") reasons.push("Source of funds described as other");
  if (a.thirdPartyFunding === "yes") reasons.push("Funds come from a third party");
  if (a.politicallyExposed === "yes") reasons.push("Politically exposed person");
  if (amlEnhanced(policy, facts)) reasons.push("Enhanced due diligence applies");
  return { complete: missing.length === 0, missing, reviewStatus: reasons.length ? "review_required" : "submitted", reasons };
}

export function amlRequirementState(latest: { review_status: string } | null | undefined): { state: ChecklistState; reason?: string } {
  const s = latest?.review_status;
  if (!s) return { state: "missing" };
  if (s === "submitted" || s === "cleared") return { state: "valid" };
  return { state: "review_required", reason: "Compliance Review Required" };
}

// ============================================================ DEMOGRAPHICS

export const PREFER_NOT = "prefer_not_to_answer";
export const DEMOGRAPHIC_QUESTIONS = [
  { key: "gender", label: "Gender", options: ["woman", "man", "non_binary", "self_describe", PREFER_NOT] },
  { key: "race_ethnicity", label: "Race / ethnicity", options: ["american_indian_alaska_native", "asian", "black_african_american", "hispanic_latino", "middle_eastern_north_african", "native_hawaiian_pacific_islander", "white", "multiple", "self_describe", PREFER_NOT] },
  { key: "veteran", label: "U.S. military veteran", options: ["yes", "no", PREFER_NOT] },
  { key: "age_range", label: "Age range", options: ["under_30", "30_44", "45_59", "60_plus", PREFER_NOT] },
] as const;

/** Optional. Returns only known keys/options; everything else is dropped. Never blocks anything. */
export function sanitizeDemographics(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of DEMOGRAPHIC_QUESTIONS) {
    const v = raw[q.key];
    if (typeof v === "string" && (q.options as readonly string[]).includes(v)) out[q.key] = v;
  }
  return out;
}

// ============================================================= ELIGIBILITY

export interface EligibilityParams {
  minimumCents?: number | null;
  allowedProfileTypes?: string[];
  blockedCountries?: string[];
  allowedCountries?: string[];
  customText?: string;
}

/** Investor-facing prompts. Wording of legal representations is pending approval. */
export const ELIGIBILITY_PROMPTS: Record<string, string> = {
  qualified_purchaser: "Does this investing profile meet the \"qualified purchaser\" definition that applies to this fund?",
  qualified_client: "Does this investing profile meet the \"qualified client\" definition that applies to this fund?",
  erisa_benefit_plan: "Is this investment being made with assets of an employee benefit plan or similar plan?",
  investment_company_status: "Is this investing profile itself an investment company or a private fund?",
  purchaser_representative: "Are you relying on a purchaser representative for this investment?",
  investment_intent: "Are you acquiring this interest for your own account, for investment and not for resale?",
  authority_capacity: "Do you have the authority and capacity to make this investment for this investing profile?",
  finra_affiliation: "Is this investor, or anyone who controls it, associated with a FINRA member firm?",
  custom_representation: "",
};
export const ELIGIBILITY_WORDING_STATUS = "approval_required" as const;

/** For each prompt, the answer that satisfies without review. Anything else → review. */
export const SATISFYING_ANSWER: Record<string, "yes" | "no"> = {
  qualified_purchaser: "yes",
  qualified_client: "yes",
  erisa_benefit_plan: "no",
  investment_company_status: "no",
  purchaser_representative: "no",
  investment_intent: "yes",
  authority_capacity: "yes",
  finra_affiliation: "no",
  custom_representation: "yes",
};

export const AUTO_EVALUATED = new Set(["minimum_investment", "investor_type_restriction", "jurisdiction_restriction", "accredited_investor"]);

export function autoEligibility(
  key: string,
  params: EligibilityParams | undefined,
  facts: { commitmentCents: number | null | undefined; profileType: string | null | undefined; country: string | null | undefined; waiverApproved?: boolean },
): EligibilityOutcome {
  if (key === "accredited_investor") return "not_applicable";
  if (key === "minimum_investment") {
    const min = params?.minimumCents;
    if (min == null) return "needs_review";
    if (facts.commitmentCents == null) return "needs_information";
    if (facts.commitmentCents >= min) return "satisfied";
    return facts.waiverApproved ? "satisfied" : "needs_review";
  }
  if (key === "investor_type_restriction") {
    const allowed = params?.allowedProfileTypes ?? [];
    if (!facts.profileType) return "needs_information";
    if (!allowed.length) return "needs_review";
    return allowed.includes(facts.profileType) ? "satisfied" : "needs_review";
  }
  if (key === "jurisdiction_restriction") {
    const c = String(facts.country ?? "").toUpperCase();
    if (!c) return "needs_information";
    const blocked = (params?.blockedCountries ?? []).map((x) => x.toUpperCase());
    const allowed = (params?.allowedCountries ?? []).map((x) => x.toUpperCase());
    if (blocked.includes(c)) return "needs_review";
    if (allowed.length && !allowed.includes(c)) return "needs_review";
    return "satisfied";
  }
  return "needs_information";
}

/** A browser answer resolves only to "flag" or a satisfying value; the server re-derives it. */
export function answeredEligibility(key: string, answer: string | null | undefined, reviewStatus?: string | null): EligibilityOutcome {
  if (reviewStatus === "cleared") return "satisfied";
  if (reviewStatus === "needs_information") return "needs_information";
  if (!answer) return "not_started";
  return answer === SATISFYING_ANSWER[key] ? "satisfied" : "needs_review";
}

// ========================================================== PERMISSIONS

/**
 * Granular Harmonious permissions, derived from the existing Operations
 * capability model. Being an administrator does not by itself open
 * sensitive tax evidence; only the tax role and super administrators do.
 */
export type TaxPermission =
  | "view_tax_status"
  | "access_sensitive_tax_records"
  | "review_tax_classification"
  | "review_compliance"
  | "configure_fund_eligibility"
  | "approve_compliance_exceptions";

const PERMISSION_ROLES: Record<TaxPermission, string[]> = {
  view_tax_status: ["super_admin", "admin", "operations", "compliance", "tax", "fund_administration", "client_success", "executive"],
  access_sensitive_tax_records: ["super_admin", "tax"],
  review_tax_classification: ["super_admin", "tax", "compliance"],
  review_compliance: ["super_admin", "admin", "compliance"],
  configure_fund_eligibility: ["super_admin", "admin", "legal", "compliance"],
  approve_compliance_exceptions: ["super_admin", "compliance"],
};

export function taxPermissions(roles: readonly string[]): TaxPermission[] {
  return (Object.keys(PERMISSION_ROLES) as TaxPermission[]).filter((p) => PERMISSION_ROLES[p].some((r) => roles.includes(r)));
}
export function hasTaxPermission(roles: readonly string[], p: TaxPermission): boolean {
  return PERMISSION_ROLES[p].some((r) => roles.includes(r));
}
