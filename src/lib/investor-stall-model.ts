/** Pure grouping for the "Where investors are stuck" report. Display only; grants no authority. */
export type StallRow = {
  fundName: string;
  stage: string;
  entrySource: string | null;
  hasLogin: boolean;
  hasAnswers: boolean;
  lastActivityAt: string | null;
};

export type StallReason = "no_login_imported" | "no_login_invited" | "signed_in_no_answers" | "answers_incomplete";

export const STALL_LABEL: Record<StallReason, string> = {
  no_login_imported: "Added from records, never invited to sign in",
  no_login_invited: "Invited, never signed in",
  signed_in_no_answers: "Signed in, About You not started",
  answers_incomplete: "About You started, not finished",
};

const IMPORTED = new Set(["document", "bulk", "harmonious"]);

export function stallReason(r: StallRow): StallReason {
  if (!r.hasLogin) return IMPORTED.has(r.entrySource ?? "") ? "no_login_imported" : "no_login_invited";
  return r.hasAnswers ? "answers_incomplete" : "signed_in_no_answers";
}

export function isStale(r: StallRow, now: Date, days = 14) {
  if (!r.lastActivityAt) return true;
  return now.getTime() - new Date(r.lastActivityAt).getTime() > days * 86400000;
}

export function summarizeStalls(rows: StallRow[], now = new Date()) {
  const byFund = new Map<string, { fund: string; total: number; stale: number; reasons: Record<StallReason, number> }>();
  for (const r of rows) {
    if (r.stage !== "profile_selected" && r.stage !== "started") continue;
    const f = byFund.get(r.fundName) ?? { fund: r.fundName, total: 0, stale: 0, reasons: { no_login_imported: 0, no_login_invited: 0, signed_in_no_answers: 0, answers_incomplete: 0 } };
    f.total++;
    if (isStale(r, now)) f.stale++;
    f.reasons[stallReason(r)]++;
    byFund.set(r.fundName, f);
  }
  return [...byFund.values()].sort((a, b) => b.total - a.total);
}
