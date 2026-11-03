/** Pure rules for software issue intake and stage changes; the database enforces the same order. */
export const ISSUE_STAGES = ["reported", "in_progress", "fixed", "deployed", "retest_passed", "retest_failed", "resolved"] as const;
export type IssueStage = (typeof ISSUE_STAGES)[number];

export const STAGE_LABEL: Record<IssueStage, string> = {
  reported: "Reported", in_progress: "Being fixed", fixed: "Fixed, not yet live", deployed: "Live, waiting for retest",
  retest_passed: "Retest passed", retest_failed: "Retest failed", resolved: "Resolved",
};

/** Next steps a person may take, given their role on the issue. */
export function nextSteps(stage: IssueStage, who: { owner: boolean; retester: boolean }): IssueStage[] {
  const out: IssueStage[] = [];
  if (who.owner) {
    if (stage === "reported" || stage === "retest_failed") out.push("in_progress");
    if (stage === "in_progress") out.push("fixed");
    if (stage === "fixed") out.push("deployed");
  }
  if (who.retester && stage === "deployed") out.push("retest_passed", "retest_failed");
  if ((who.owner || who.retester) && stage === "retest_passed") out.push("resolved");
  return out;
}

/** Rejects text that looks like a tax ID, bank/account number, or a password. Never stored when flagged. */
export function sensitiveTextProblem(text: string): string | null {
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) return "Remove what looks like a Social Security or tax ID number.";
  if (/\b\d{2}-\d{7}\b/.test(text)) return "Remove what looks like an EIN.";
  if (/\b\d{8,17}\b/.test(text)) return "Remove what looks like a bank, account or ID number.";
  if (/\b(password|passcode|secret|api[_ -]?key)\s*[:=]/i.test(text)) return "Remove passwords or keys.";
  return null;
}
