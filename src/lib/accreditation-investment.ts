import { isLiveInvestment } from "@/lib/investment-amounts";

/**
 * Which investment the accreditation step is for when the address doesn't say.
 * Only the investor's own open investments count; a single one is used
 * directly, several need the investor to choose, and none keeps the older
 * account-level behavior. Fund rules always come from that investment's offering.
 */
export type AccreditationInvestmentRow = {
  id: string;
  offering_id: string | null;
  stage?: string | null;
  removed_at?: string | null;
  closed_at?: string | null;
  merged_into_onboarding_id?: string | null;
};

const ENDED_STAGES = new Set(["closed", "declined", "cancelled", "withdrawn", "rejected"]);

export function isOpenAccreditationInvestment(row: AccreditationInvestmentRow): boolean {
  return isLiveInvestment(row) && !row.closed_at && !!row.offering_id && !ENDED_STAGES.has(String(row.stage ?? ""));
}

export type AccreditationInvestmentPick =
  | { kind: "one"; onboardingId: string }
  | { kind: "many"; onboardingIds: string[] }
  | { kind: "none" };

export function pickAccreditationInvestment(rows: AccreditationInvestmentRow[]): AccreditationInvestmentPick {
  const open = rows.filter(isOpenAccreditationInvestment);
  if (open.length === 1 && open[0]) return { kind: "one", onboardingId: open[0].id };
  if (open.length > 1) return { kind: "many", onboardingIds: open.map((r) => r.id) };
  return { kind: "none" };
}
