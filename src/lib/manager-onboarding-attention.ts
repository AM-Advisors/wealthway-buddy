/**
 * Wording for the fund manager's "waiting on investor" attention cards: the
 * investing party's name and the exact step they are on. Pure and display-only.
 */
import { STAGE_ACTION } from "@/lib/stalled-items";

/** Stages that are finished or withdrawn and never belong on the waiting list. */
export const CLOSED_ONBOARDING_STAGES = ["closed", "declined", "cancelled", "withdrawn"] as const;

export function isOpenOnboardingStage(stage: string | null | undefined): boolean {
  return !(CLOSED_ONBOARDING_STAGES as readonly string[]).includes(String(stage ?? ""));
}

type PersonLite = { preferred_name?: string | null; legal_first_name?: string | null; legal_last_name?: string | null; email?: string | null } | null | undefined;
type ProfileLite = { display_label?: string | null; legal_name?: string | null } | null | undefined;

const clean = (v: string | null | undefined) => (v ?? "").trim();

/** Investing party first (a trust or company), then the person, then their email. */
export function onboardingInvestorName(profile: ProfileLite, person: PersonLite): string {
  const personName = person ? clean(person.preferred_name) || [clean(person.legal_first_name), clean(person.legal_last_name)].filter(Boolean).join(" ") : "";
  return clean(profile?.legal_name) || clean(profile?.display_label) || personName || clean(person?.email) || "Unnamed investor";
}

/** Plain step wording, e.g. "Waiting on the investor to finish the ID check". */
export function onboardingWaitingStatus(stage: string | null | undefined): string {
  const s = String(stage ?? "");
  if (s === "harmonious_review") return "Investor signed. Approve and countersign under Approvals";
  const step = STAGE_ACTION[s];
  if (step && step.owner === "Investor") return `Waiting on the investor to ${step.action.replace(/^Investor needs to /, "")}`;
  if (step) return step.action;
  return "Waiting on the investor to continue";
}

/** The investor has signed and only the fund's approval/countersignature is left. */
export function managerOnboardingFundTurn(stage: string | null | undefined, investorSigned: boolean): boolean {
  const s = String(stage ?? "");
  return s === "harmonious_review" || (investorSigned && s === "signature");
}

/**
 * One shared rule for every manager/ops work queue (attention cards, investor
 * to-dos): only live, real investments belong there. Excludes finished or
 * withdrawn stages, closed, removed or merged records, and test investors.
 */
export type QueueOnboardingLite = {
  stage?: string | null;
  closed_at?: string | null;
  removed_at?: string | null;
  merged_into_onboarding_id?: string | null;
  is_test_investor?: boolean | null;
};
export function belongsInWorkQueue(o: QueueOnboardingLite): boolean {
  return isOpenOnboardingStage(o.stage) && !o.closed_at && !o.removed_at && !o.merged_into_onboarding_id && o.is_test_investor !== true;
}
