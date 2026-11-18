/**
 * Invited-investor activity: a pure projection of recorded evidence (invitation
 * sends, invitation-link opens, sign-ins, investor-side onboarding events and the
 * fund's verification link) into one plain-language engagement level per investor.
 * Display only; never changes a record and never infers reading or signatures.
 */
export type InviteLevel = "not_invited" | "invited" | "opened" | "started" | "verified";

export type InviteActivityInput = {
  hasEmail: boolean;
  /** The investor has their own login connected to this investment. */
  hasAccount?: boolean;
  /** Invitation emails sent or personal links shared, oldest first not required. */
  invitedAt: string[];
  /** Invitation link or fund verification link opens. */
  openedAt: string[];
  /** Account sign-in on the invitation, or investor-side onboarding activity. */
  startedAt: string[];
  verificationFinishedAt: string | null;
};

export type InviteActivity = {
  level: InviteLevel;
  firstInvitedAt: string | null;
  lastInvitedAt: string | null;
  lastTouchAt: string | null;
  followUp: boolean;
  followUpReason: string | null;
};

/** Invited with no open after this many days, or opened with nothing after, needs a nudge. */
export const NO_OPEN_FOLLOW_UP_DAYS = 3;
export const STALLED_FOLLOW_UP_DAYS = 7;
const DAY = 86_400_000;

const max = (xs: (string | null | undefined)[]) => xs.filter(Boolean).sort().at(-1) ?? null;
const min = (xs: (string | null | undefined)[]) => xs.filter(Boolean).sort()[0] ?? null;

export function inviteActivity(i: InviteActivityInput, now: Date = new Date()): InviteActivity {
  const firstInvitedAt = min(i.invitedAt), lastInvitedAt = max(i.invitedAt);
  const lastOpen = max(i.openedAt), lastStart = max(i.startedAt);
  const level: InviteLevel = i.verificationFinishedAt ? "verified"
    : lastStart ? "started"
    : lastOpen ? "opened"
    : firstInvitedAt ? "invited"
    : "not_invited";
  const lastTouchAt = max([lastOpen, lastStart, i.verificationFinishedAt]);
  const days = (iso: string | null) => (iso ? (now.getTime() - new Date(iso).getTime()) / DAY : 0);
  let followUpReason: string | null = null;
  if (!firstInvitedAt && !i.hasAccount) followUpReason = !i.hasEmail ? "Add their email so you can invite them" : level === "not_invited" ? "Not invited yet" : "Invite them to continue";
  else if (level === "invited" && days(lastInvitedAt) >= NO_OPEN_FOLLOW_UP_DAYS) followUpReason = `No click ${Math.floor(days(lastInvitedAt))} days after the invitation`;
  else if ((level === "opened" || level === "started") && days(lastTouchAt) >= STALLED_FOLLOW_UP_DAYS) followUpReason = `No activity for ${Math.floor(days(lastTouchAt))} days`;
  return { level, firstInvitedAt, lastInvitedAt, lastTouchAt, followUp: followUpReason !== null, followUpReason };
}

export const INVITE_LEVEL_LABEL: Record<InviteLevel, string> = {
  not_invited: "Not invited yet",
  invited: "Invited, hasn't clicked",
  opened: "Clicked the link",
  started: "Started onboarding",
  verified: "Finished identity check",
};

export const INVITE_LEVEL_ORDER: InviteLevel[] = ["not_invited", "invited", "opened", "started", "verified"];

/** Plain label for someone seen only on the fund's verification link (no screening detail). */
export function linkOnlyLabel(status: string | null | undefined): string {
  const st = String(status ?? "").toLowerCase();
  if (st === "approved" || st === "in review" || st === "declined" || st === "resubmitted") return "Finished identity check, not added yet";
  if (st === "in progress") return "Started identity check";
  return "Opened the link";
}

export function countInviteLevels(levels: InviteLevel[]): Record<InviteLevel, number> {
  const out = { not_invited: 0, invited: 0, opened: 0, started: 0, verified: 0 } as Record<InviteLevel, number>;
  for (const l of levels) out[l] += 1;
  return out;
}
