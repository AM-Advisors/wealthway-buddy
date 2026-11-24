import type { FundAccess } from "./fund-access";
import type { JourneyStepView } from "./investor-journey-model";

export function canOpenInvestorPerspective(access: FundAccess) {
  return access.staff || access.manager || (access.canView && access.teamRole !== null);
}

export const PERSPECTIVE_STEPS = ["about", "verify", "sign", "fund"] as const;
export type PerspectiveStep = typeof PERSPECTIVE_STEPS[number];

export function perspectiveStepFor(key: string): PerspectiveStep {
  if (["account", "investment_profile", "investment_amount", "close_amount", "beneficial_owners"].includes(key)) return "about";
  if (["identity_verification", "entity_verification", "aml", "accreditation", "eligibility"].includes(key)) return "verify";
  if (["funding", "approved_to_fund", "manager_approval", "acceptance", "closed"].includes(key)) return "fund";
  return "sign";
}

export const COMPLETION_EVENTS: Record<string, { label: string; step: PerspectiveStep }> = {
  profile_selected: { label: "Investing profile selected", step: "about" },
  questionnaire_prepared_by_team: { label: "Questionnaire answers prepared", step: "sign" },
  questionnaire_submitted: { label: "Questionnaire submitted", step: "sign" },
  signature_completed: { label: "Signature recorded", step: "sign" },
  verification_auto_advanced: { label: "Verification step advanced", step: "verify" },
  investor_reports_funds_sent: { label: "Investor reported funds sent", step: "fund" },
  approved_to_fund: { label: "Funding access approved", step: "fund" },
  subscription_auto_submitted: { label: "Subscription submitted automatically", step: "sign" },
};

export function completionActor(role: string | null, name: string | null) {
  if (role === "system") return "System";
  return name || (role === "investor" ? "Investor" : role === "preparer" ? "Preparer" : role === "manager" || role === "fund_manager" ? "Fund manager" : role === "harmonious" || role === "staff" ? "Harmonious" : "Not recorded");
}

export function safePerspectiveQuestion(key: string, label: string) {
  return !/(?:\bssn\b|social[ _-]*security|\bitin\b|\bein\b|tax[ _-]*(?:id|identification|number)|routing|(?:bank[ _-]*)?account[ _-]*number|passport[ _-]*number|license[ _-]*number)/i.test(`${key} ${label}`);
}

export type InvestorPerspectiveData = {
  onboardingId: string;
  fundName: string;
  investorName: string;
  profileLabel: string | null;
  amountCents: number | null;
  steps: JourneyStepView[];
  items: { key: string; label: string; status: string; owner: string | null }[];
  questions: { key: string; label: string; answer: string | null }[];
  canReadDetails: boolean;
  participants: { id: string; name: string; role: string; status: string }[];
  selectedParticipant: { id: string; name: string; role: string } | null;
  person: { label: string; value: string }[];
  documents: { id: string; title: string; status: string }[];
  history: { id: string; label: string; step: PerspectiveStep; actor: string; at: string }[];
  missing: PerspectiveField[];
  editor: PerspectiveEditor;
};
export type PerspectiveEditor = "staff" | "manager" | "team" | null;
export type PerspectiveField = { key: PerspectiveFieldKey; label: string; group: "person" | "profile" | "tax" | "investment" };
export type PerspectiveFieldKey = "firstName" | "lastName" | "email" | "phone" | "dateOfBirth" | "addressLine1" | "city" | "region" | "postalCode" | "country" | "legalName" | "taxId" | "commitmentCents";

/** Who may type into the client perspective. View-only fund team never edits; server saves re-authorize. */
export function perspectiveEditor(access: FundAccess, teamManagesInvestors: boolean): PerspectiveEditor {
  if (access.staff) return "staff";
  if (access.manager) return "manager";
  return teamManagesInvestors ? "team" : null;
}

/** Investor-only requirements never get inputs: answers, certifications, signatures, consent. */
export const INVESTOR_ONLY_KEYS = new Set(["bsa_aml", "subscription_questionnaire", "financial_background", "certifications", "review_certify", "signatures", "identity_verification"]);

/** Personal accounts (individual, joint, IRA) use SSNs and personal names; everything else is an entity. */
export const PERSONAL_PROFILE_TYPES = new Set(["individual", "joint", "ira", "retirement_plan"]);
export const isEntityProfile = (t: unknown) => typeof t === "string" && t !== "" && !PERSONAL_PROFILE_TYPES.has(t);

const blank = (v: unknown) => v == null || String(v).trim() === "";

export function perspectiveMissingFields(input: {
  person: Record<string, unknown>; profile: Record<string, unknown> | null; amountCents: number | null;
}): PerspectiveField[] {
  const p = input.person, out: PerspectiveField[] = [];
  const add = (key: PerspectiveFieldKey, label: string, group: PerspectiveField["group"], value: unknown) => { if (blank(value)) out.push({ key, label, group }); };
  add("firstName", "Legal first name", "person", p["legal_first_name"]);
  add("lastName", "Legal last name", "person", p["legal_last_name"]);
  add("email", "Email", "person", p["email"]);
  add("phone", "Phone", "person", p["phone"]);
  add("dateOfBirth", "Date of birth", "person", p["date_of_birth"]);
  add("addressLine1", "Street address", "person", p["address_line1"]);
  add("city", "City", "person", p["city"]);
  add("region", "State", "person", p["region"]);
  add("postalCode", "ZIP code", "person", p["postal_code"]);
  add("country", "Country", "person", p["country"]);
  const entity = Boolean(input.profile) && isEntityProfile(input.profile?.["profile_type"]);
  if (entity) add("legalName", "Entity legal name", "profile", input.profile?.["legal_name"]);
  add("taxId", entity ? "EIN" : "SSN", "tax", input.profile?.["tax_id_last4"] ?? p["tax_id_last4"]);
  if (input.amountCents == null || input.amountCents <= 0) out.push({ key: "commitmentCents", label: "Commitment amount", group: "investment" });
  return out;
}
