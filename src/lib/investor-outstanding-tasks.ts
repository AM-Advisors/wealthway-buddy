import type { RequirementKey, RequirementResult } from "@/lib/investor-onboarding-model";
import { STEP_REQUIREMENTS, type JourneyStep, type JourneyStepView } from "@/lib/investor-journey-model";

export type InvestorOutstandingTask = {
  key: RequirementKey;
  label: string;
  step: JourneyStep;
  status: "Action needed" | "Available later" | "In review" | "Waiting on fund countersignature";
  actionable: boolean;
};

/** A read of canonical requirements, never a second completion checklist. */
export function investorOutstandingTasks(requirements: readonly RequirementResult[], steps: readonly JourneyStepView[]): InvestorOutstandingTask[] {
  const seen = new Set<RequirementKey>();
  return requirements.flatMap((r) => {
    if (seen.has(r.key) || r.state === "valid" || r.state === "not_applicable") return [];
    seen.add(r.key);
    const step = (Object.keys(STEP_REQUIREMENTS) as JourneyStep[]).find((k) => STEP_REQUIREMENTS[k].includes(r.key))
      ?? (r.key === "bad_actor" ? "verify" : "sign");
    const locked = steps.find((s) => s.key === step)?.state === "locked";
    const waiting = r.key === "signature" && r.awaitingCountersign === true;
    const review = r.state === "review_required";
    return [{ key: r.key, label: r.label, step,
      status: waiting ? "Waiting on fund countersignature" as const : review ? "In review" as const : locked ? "Available later" as const : "Action needed" as const,
      actionable: !waiting && !review && !locked,
    }];
  });
}