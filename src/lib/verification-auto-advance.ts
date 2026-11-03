import { journeySteps } from "./investor-journey-model";
import type { RequirementResult } from "./investor-onboarding-model";

/** Advancement is navigation only, never an approval or signature. */
export function shouldAdvanceVerifiedInvestor(stage: string, requirements: RequirementResult[], removed: boolean): boolean {
  if (stage !== "verification" || removed) return false;
  const journey = journeySteps(requirements, { stage, approvedToFund: false, fundingStatus: null, investorReportsSent: false });
  return journey.find(s => s.key === "about")?.state === "complete"
    && journey.find(s => s.key === "verify")?.state === "complete"
    && journey.find(s => s.key === "sign")?.state !== "locked";
}