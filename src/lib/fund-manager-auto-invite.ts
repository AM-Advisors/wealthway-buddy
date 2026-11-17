/**
 * Automatic fund manager invitations: pure rules. A person named on one fund as
 * Manager/GP on its team, or as one of its signers, is invited to that fund only.
 * Client-wide descriptive roles never qualify. Server side lives in
 * fund-manager-auto-invite.server.ts.
 */
import { isHarmoniousStaffEmail } from "@/lib/harmonious-staff";

/** Fund team roles that make someone a fund manager of that fund. */
export const AUTO_INVITE_TEAM_ROLES = ["gp", "manager"] as const;

export type AutoInviteSource = "team" | "signer";

export type AutoInviteSkip =
  | "not_manager_role"
  | "no_email"
  | "harmonious_staff"
  | "not_authorized"
  | "already_manager"
  | "access_removed";

export type AutoInviteDecision = { invite: true; email: string } | { invite: false; reason: AutoInviteSkip };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function autoInviteDecision(input: {
  source: AutoInviteSource;
  teamRole?: string | null | undefined;
  email?: string | null | undefined;
  /** Caller is an administrator, a manager of this exact fund, or an already-authorized fund request. */
  actorAuthorized: boolean;
  /** This email already holds fund manager access to this fund. */
  alreadyManager: boolean;
  /** Fund manager access for this email on this fund was revoked or removed before. */
  accessRemoved: boolean;
}): AutoInviteDecision {
  if (input.source === "team" && !(AUTO_INVITE_TEAM_ROLES as readonly string[]).includes(String(input.teamRole ?? ""))) {
    return { invite: false, reason: "not_manager_role" };
  }
  const email = (input.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL.test(email)) return { invite: false, reason: "no_email" };
  if (isHarmoniousStaffEmail(email)) return { invite: false, reason: "harmonious_staff" };
  if (!input.actorAuthorized) return { invite: false, reason: "not_authorized" };
  if (input.alreadyManager) return { invite: false, reason: "already_manager" };
  if (input.accessRemoved) return { invite: false, reason: "access_removed" };
  return { invite: true, email };
}

export type AutoInviteResult =
  | { status: "invited"; note: string }
  | { status: "access_given"; note: string }
  | { status: "skipped"; reason: AutoInviteSkip; note: string | null }
  | { status: "failed"; note: string };

/** Plain-words message for the person who saved, or null when nothing needs saying. */
export function skipNote(reason: AutoInviteSkip, name: string): string | null {
  switch (reason) {
    case "no_email":
      return `Add an email for ${name} and they'll get their fund manager invitation automatically.`;
    case "not_authorized":
      return `${name} wasn't invited as a fund manager. An administrator or one of this fund's managers can invite them.`;
    case "access_removed":
      return `${name}'s fund manager access was removed earlier, so they weren't invited again automatically.`;
    default:
      return null;
  }
}
