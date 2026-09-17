/**
 * Dedicated invitation role type.
 *
 * Fund invitations no longer borrow the platform-wide `app_role` enum: the only
 * roles that can ever be handed out through an invitation are investor and fund
 * manager. The database mirrors this with the `public.invitation_role` enum on
 * `fund_invitations.invite_role`, so a privileged role cannot be stored even if
 * a request tried to send one.
 */
export const INVITABLE_ROLES = ["investor", "fund_manager"] as const;

export type InvitationRole = (typeof INVITABLE_ROLES)[number];

export function isInvitationRole(value: unknown): value is InvitationRole {
  return typeof value === "string" && (INVITABLE_ROLES as readonly string[]).includes(value);
}

export function assertInvitationRole(value: unknown): InvitationRole {
  if (!isInvitationRole(value)) {
    throw new Error("Only investors and fund managers can be invited to a fund.");
  }
  return value;
}

export function invitationRoleLabel(role: InvitationRole): string {
  return role === "fund_manager" ? "Fund manager" : "Investor";
}
