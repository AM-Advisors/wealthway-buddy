/**
 * Guided fund setup - pure projection of "who is each step waiting on".
 * Display only: never grants authority or gates work.
 */
export const SETUP_STEPS = ["fund_details", "team", "fees_team", "bank", "document", "launch"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];
export const SETUP_STEP_LABEL: Record<SetupStep, string> = {
  fund_details: "Fund details", team: "Team", fees_team: "Fees & terms", bank: "Bank / wire", document: "Documents", launch: "Review & launch",
};

export type StepStatus = "done" | "waiting_manager" | "waiting_harmonious" | "needs_changes";
export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  done: "Done", waiting_manager: "Waiting on fund manager", waiting_harmonious: "Waiting on Harmonious", needs_changes: "Needs changes",
};

export type StepInput = {
  /** Latest non-withdrawn manager submission status for this step, if any. */
  submission?: "submitted" | "approved" | "returned" | null;
  /** Nothing required is missing from the fund record. */
  complete: boolean;
  /** Values are still unconfirmed Harmonious defaults or Drive proposals. */
  pendingProposals?: boolean;
  /** Steps only Harmonious can finish (team, launch). */
  harmoniousOwned?: boolean;
};

export function stepStatus(i: StepInput): StepStatus {
  if (i.submission === "submitted") return "waiting_harmonious";
  if (i.submission === "returned") return "needs_changes";
  if (i.complete && !i.pendingProposals) return "done";
  if (i.pendingProposals || i.harmoniousOwned) return "waiting_harmonious";
  return "waiting_manager";
}

/** Canonical banking completion counts even when no manager uploaded a letter. */
export function bankSetupStatus(bankOnFile: boolean, submission: StepInput["submission"]): StepStatus {
  return stepStatus({ submission, complete: bankOnFile || submission === "approved" });
}

/** How many steps are waiting on the viewer. */
export function waitingOnViewer(statuses: readonly StepStatus[], viewerIsStaff: boolean): number {
  return statuses.filter((s) => (viewerIsStaff ? s === "waiting_harmonious" : s === "waiting_manager" || s === "needs_changes")).length;
}

/** Standard choices offered as "Default — confirm". Fees are never defaulted. */
export function setupDefaults(current: Record<string, string>, opts: { saasOnly: boolean }): Record<string, string> {
  const d: Record<string, string> = { jurisdiction: "Delaware", entityType: "LLC", regType: "506b", solicitationStates: "All states", administrator: opts.saasOnly ? "Client (SaaS-only)" : "Harmonious" };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) if (!current[k]?.trim()) out[k] = v;
  return out;
}

const SECRET = [/\b\d{2}-?\d{7}\b/g, /\b\d{3}-?\d{2}-?\d{4}\b/g, /\b\d{8,17}\b/g];
/** Strip EIN/SSN/account-number-like strings before AI calls and from results. */
export function redactSensitive(text: string): string {
  return SECRET.reduce((t, re) => t.replace(re, "[redacted]"), text);
}

/** Drive files worth reading for setup, by name. */
export function isSetupFile(name: string): boolean {
  return /form\s*d|certificate of formation|operating agreement|\blloa\b|close sheet|lp agreement|limited partnership agreement|ppm|private placement/i.test(name) && !/redline|template/i.test(name);
}
