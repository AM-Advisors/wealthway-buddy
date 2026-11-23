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
  if (s === "harmonious_review") return "Harmonious is reviewing this investor";
  const step = STAGE_ACTION[s];
  if (step && step.owner === "Investor") return `Waiting on the investor to ${step.action.replace(/^Investor needs to /, "")}`;
  if (step) return step.action;
  return "Waiting on the investor to continue";
}
