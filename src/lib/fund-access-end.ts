/**
 * When an investor is removed from a Fund, their "can see this Fund" access
 * ends too, unless something else still ties them to it. Pure rule so the
 * removal path and its tests agree.
 */
export const ENDED_APPLICATION_STATUSES = new Set(["withdrawn", "declined", "rejected", "cancelled"]);
const ENDED_STAGES = new Set(["cancelled", "declined"]);

export type FundTies = {
  /** Other investments for this login in this Fund (excluding the one being removed). */
  otherOnboardings: { stage: string | null; removed_at: string | null; merged_into_onboarding_id?: string | null }[];
  applications: { status: string | null }[];
  /** Signed fund documents for this login in this Fund: their copies must stay reachable. */
  signatureCount: number;
  holdingCount: number;
};

export function fundAccessShouldEnd(t: FundTies): boolean {
  if (t.signatureCount > 0 || t.holdingCount > 0) return false;
  if (t.otherOnboardings.some((o) => !o.removed_at && !o.merged_into_onboarding_id && !ENDED_STAGES.has(String(o.stage ?? "")))) return false;
  if (t.applications.some((a) => !ENDED_APPLICATION_STATUSES.has(String(a.status ?? "")))) return false;
  return true;
}
