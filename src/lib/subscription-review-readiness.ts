import type { RequirementResult } from "./investor-onboarding-model";

// The same retained outside-signing evidence must feed both display and gates.
const OUTSIDE_SUBSCRIPTION_KEYS = new Set([
  "subscription_questionnaire", "certifications", "subscription_documents", "signature", "bad_actor", "bsa_aml",
]);
const REVIEW_ENTRY_STAGES = new Set(["started", "profile_selected", "verification", "eligibility", "tax", "subscription", "signature"]);

export function outsideSignedRequirements(requirements: RequirementResult[], outside?: { complete: boolean; signedOn: string | null }) {
  if (!outside?.complete || !outside.signedOn) return requirements;
  return requirements.map(r => OUTSIDE_SUBSCRIPTION_KEYS.has(r.key) && r.state === "missing"
    ? { ...r, state: "valid" as const, reason: `Signed outside the platform on ${outside.signedOn}; copy loaded by Harmonious.` }
    : r);
}

export function subscriptionReadyForReview(stage: string, requirements: RequirementResult[], removed: boolean, approved: boolean, blockingExceptions: number) {
  if (removed || approved || blockingExceptions > 0 || (!REVIEW_ENTRY_STAGES.has(stage) && stage !== "harmonious_review")) return false;
  const required = requirements.filter(r => r.key !== "funding");
  return required.some(r => r.key === "signature" && r.state === "valid")
    && required.every(r => r.state === "valid" || r.state === "not_applicable");
}