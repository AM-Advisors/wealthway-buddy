/**
 * Fund team sign-up invitations: pure rules. Anyone added to a fund team with an email
 * gets one sign-up invitation for that fund (view access as recorded, via the existing
 * client contact invite). Manager/GP rows use fund-manager-auto-invite instead.
 */
import { isHarmoniousStaffEmail } from "@/lib/harmonious-staff";
import { AUTO_INVITE_TEAM_ROLES } from "@/lib/fund-manager-auto-invite";

export type TeamInviteSkip = "manager_role" | "no_email" | "harmonious_staff" | "has_account" | "already_invited" | "removed";
export type TeamInviteDecision = { invite: true; email: string } | { invite: false; reason: TeamInviteSkip };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function teamInviteDecision(m: {
  teamRole?: string | null; email?: string | null; userId?: string | null;
  invitedAt?: string | null; removedAt?: string | null; resend?: boolean;
}): TeamInviteDecision {
  if (m.removedAt) return { invite: false, reason: "removed" };
  if ((AUTO_INVITE_TEAM_ROLES as readonly string[]).includes(String(m.teamRole ?? ""))) return { invite: false, reason: "manager_role" };
  const email = (m.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL.test(email)) return { invite: false, reason: "no_email" };
  if (isHarmoniousStaffEmail(email)) return { invite: false, reason: "harmonious_staff" };
  if (m.userId) return { invite: false, reason: "has_account" };
  if (m.invitedAt && !m.resend) return { invite: false, reason: "already_invited" };
  return { invite: true, email };
}

/** Plain status shown beside each team member. */
export function teamInviteStatus(m: { userId?: string | null; invitedAt?: string | null; email?: string | null }) {
  if (m.userId) return "Signed in";
  if (m.invitedAt) return `Invited ${new Date(m.invitedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  return m.email ? "Not invited yet" : "No email";
}
