/** Pure per-step status for the four investor onboarding steps. Display only; grants no authority. */
export type StepKey = "about_you" | "verification" | "sign" | "fund";
export type StepState = "not_started" | "in_progress" | "waiting_harmonious" | "blocked" | "complete";
export type StepStatus = { key: StepKey; label: string; state: StepState; detail: string };

export const STEP_LABELS: Record<StepKey, string> = { about_you: "About You", verification: "Verification", sign: "Sign", fund: "Fund" };
export const STEP_STATE_LABELS: Record<StepState, string> = {
  not_started: "Not started", in_progress: "Waiting on investor", waiting_harmonious: "With Harmonious", blocked: "Needs attention", complete: "Complete",
};

const OK = ["verified", "approved", "passed", "clear"];
const REVIEW = ["in_review", "pending", "review", "submitted", "processing", "needs_review"];
const BAD = ["declined", "rejected", "failed", "hit", "match", "flagged"];

export function investorSteps(i: {
  stage: string; claimed: boolean; profileChosen: boolean; questionnaireDone: boolean;
  kyc: string; aml: string; signed: boolean; outForSignature: boolean; funding: string;
}): StepStatus[] {
  const s = (key: StepKey, state: StepState, detail: string): StepStatus => ({ key, label: STEP_LABELS[key], state, detail });
  const about = i.profileChosen && i.questionnaireDone ? s("about_you", "complete", "Profile and questionnaire saved")
    : i.claimed || i.stage !== "started" ? s("about_you", "in_progress", !i.profileChosen ? "Choose investment profile" : "Finish questionnaire")
    : s("about_you", "not_started", "Investor hasn't opened their link");
  const k = String(i.kyc).toLowerCase(), a = String(i.aml).toLowerCase();
  const verification = OK.includes(k) && OK.includes(a) ? s("verification", "complete", "KYC/KYB and AML clear")
    : BAD.includes(k) || BAD.includes(a) ? s("verification", "blocked", "Check needs review before signing")
    : REVIEW.includes(k) || REVIEW.includes(a) ? s("verification", "waiting_harmonious", "Identity check under review")
    : k !== "not_started" ? s("verification", "in_progress", "Identity check started")
    : s("verification", "not_started", "Identity check not started");
  const sign = i.signed ? s("sign", "complete", "Subscription signed")
    : i.outForSignature ? s("sign", "in_progress", "Out for signature")
    : i.stage === "harmonious_review" ? s("sign", "waiting_harmonious", "Harmonious review")
    : s("sign", "not_started", "Not sent yet");
  const fund = i.funding === "funded" ? s("fund", "complete", "Funds received and matched")
    : i.funding === "needs_review" ? s("fund", "blocked", "Funding needs review")
    : i.funding === "pending_reconciliation" ? s("fund", "waiting_harmonious", "Matching incoming funds")
    : i.funding === "instructions_released" || i.funding === "investor_reports_sent" ? s("fund", "in_progress", "Waiting for investor's transfer")
    : i.funding === "ready_for_funding" ? s("fund", "waiting_harmonious", "Ready; instructions not yet released")
    : s("fund", "not_started", "Not ready to fund");
  return [about, verification, sign, fund];
}

/** The first step that isn't complete, or null when all four are done. */
export function currentStep(steps: StepStatus[]): StepStatus | null {
  return steps.find((x) => x.state !== "complete") ?? null;
}
