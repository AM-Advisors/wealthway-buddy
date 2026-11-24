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
};