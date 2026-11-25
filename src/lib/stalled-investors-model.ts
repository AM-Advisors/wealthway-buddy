/** Pure grouping of live investments by where they are waiting. Display only. */
export type StallRow = {
  id: string; offering_id: string; stage: string; last_activity_at: string;
  removed_at: string | null; merged_into_onboarding_id: string | null; is_test_investor: boolean;
};
export const STALL_DAYS = 7;
const DONE = new Set(["funded", "closed", "complete", "cancelled"]);
export const STAGE_LABEL: Record<string, string> = {
  profile_selected: "Chose investor type, nothing since",
  eligibility: "Answering eligibility questions",
  verification: "Waiting on ID or background check",
  tax: "Waiting on tax details",
  signature: "Waiting on signing",
  harmonious_review: "Waiting on review",
  approved_to_fund: "Approved, waiting on money",
  awaiting_funds: "Waiting on money",
};
export function isStalled(r: StallRow, now: Date): boolean {
  if (r.removed_at || r.merged_into_onboarding_id || r.is_test_investor || DONE.has(r.stage)) return false;
  return now.getTime() - new Date(r.last_activity_at).getTime() >= STALL_DAYS * 86_400_000;
}
export function groupStalled(rows: StallRow[], now: Date) {
  const by = new Map<string, { stage: string; label: string; total: number; stalled: number }>();
  for (const r of rows) {
    if (r.removed_at || r.merged_into_onboarding_id || r.is_test_investor || DONE.has(r.stage)) continue;
    const g = by.get(r.stage) ?? { stage: r.stage, label: STAGE_LABEL[r.stage] ?? r.stage, total: 0, stalled: 0 };
    g.total++; if (isStalled(r, now)) g.stalled++;
    by.set(r.stage, g);
  }
  return [...by.values()].sort((a, b) => b.stalled - a.stalled);
}
