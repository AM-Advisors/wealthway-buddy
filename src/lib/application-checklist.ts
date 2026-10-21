import { investorHomeSummary, type JourneyStepView } from "@/lib/investor-journey-model";

/** Presentation only: never infer completion from uploads or legacy statuses. */
export function applicationChecklistSummary(steps: JourneyStepView[]) {
  return {
    ...investorHomeSummary(steps),
    remaining: steps.filter((step) => step.state !== "complete").length,
  };
}