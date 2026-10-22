/**
 * When the fund manager countersigns an investor's agreements, per fund.
 * - pause: investor waits; wire instructions open only after countersign/approval (default).
 * - parallel: investor goes on to wire instructions; manager is asked to countersign right away.
 * - after_completion: investor finishes everything; manager is asked once the investor reaches funding.
 * In every mode, admission to the fund still requires the countersign/approval.
 */
export const COUNTERSIGN_TIMINGS = ["pause", "parallel", "after_completion"] as const;
export type CountersignTiming = (typeof COUNTERSIGN_TIMINGS)[number];

export const COUNTERSIGN_TIMING_LABELS: Record<CountersignTiming, { title: string; investor: string; manager: string }> = {
  pause: {
    title: "Pause for countersign",
    investor: "Investor signs, then waits. Wire instructions open after you countersign.",
    manager: "Countersign to let the investor continue.",
  },
  parallel: {
    title: "Countersign in parallel",
    investor: "Investor signs and goes straight to the wire instructions.",
    manager: "You're notified to countersign right away; the investor isn't held up.",
  },
  after_completion: {
    title: "Countersign at the end",
    investor: "Investor completes the whole process, including the wire instructions.",
    manager: "You get one countersign request once the investor is done.",
  },
};

export function parseCountersignTiming(v: unknown): CountersignTiming {
  return (COUNTERSIGN_TIMINGS as readonly string[]).includes(String(v)) ? (v as CountersignTiming) : "pause";
}

const TERMINAL = new Set(["declined", "cancelled", "closed"]);

/**
 * Whether funding (wire instructions) may open before the manager's countersign/approval.
 * Only for parallel/after_completion, only once every investor requirement (including signing)
 * is complete and nothing is blocking. Never admits the investor.
 */
export function fundingOpensBeforeCountersign(input: {
  timing: CountersignTiming;
  stage: string;
  outstandingRequirements: number;
  openBlockingExceptions: number;
}): boolean {
  if (input.timing === "pause") return false;
  if (TERMINAL.has(input.stage)) return false;
  return input.outstandingRequirements === 0 && input.openBlockingExceptions === 0;
}

/** Shown on Ops/manager views while funding is open but countersign is outstanding. */
export function awaitingCountersign(input: { timing: CountersignTiming; approvedToFund: boolean; fundingOpen: boolean }): boolean {
  return input.timing !== "pause" && !input.approvedToFund && input.fundingOpen;
}

/** When the manager is asked to countersign under each mode. */
export function countersignNoticeMoment(timing: CountersignTiming): "on_investor_signature" | "on_funding_step" {
  return timing === "after_completion" ? "on_funding_step" : "on_investor_signature";
}
