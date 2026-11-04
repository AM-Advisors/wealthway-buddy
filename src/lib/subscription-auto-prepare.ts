import { outstandingRequirements, signingRequirementSatisfied, type RequirementResult } from "./investor-onboarding-model";

/** Mutation-only eligibility; the preparation engine still rechecks access, fees and current facts. */
export function shouldAutoPrepareSubscription(input: {
  stage: string;
  removed: boolean;
  prepared: boolean;
  hasInvestor: boolean;
  blockingExceptions: number;
  requirements: RequirementResult[];
}): boolean {
  if (input.removed || input.prepared || !input.hasInvestor || input.blockingExceptions > 0) return false;
  if (!["profile_selected", "verification", "signature"].includes(input.stage)) return false;
  if (!input.requirements.some(r => r.key === "subscription_documents" && r.state === "missing")) return false;
  return outstandingRequirements(input.requirements).every(r =>
    ["subscription_documents", "signature", "funding"].includes(r.key) || signingRequirementSatisfied(r));
}