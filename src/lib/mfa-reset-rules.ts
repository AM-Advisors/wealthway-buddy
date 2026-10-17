/** Who may approve an authenticator reset. Super Admins may request and approve alone
 * (user decision, Oct 2026); other administrators need a second person. Nobody may approve
 * a reset of their own account. The database guard enforces the same rule. */
export function canApproveMfaReset(
  r: { status: string; target_user_id: string; requested_by: string },
  deciderId: string,
  deciderIsSuperAdmin: boolean,
): boolean {
  if (r.status !== "pending" || r.target_user_id === deciderId) return false;
  return r.requested_by !== deciderId || deciderIsSuperAdmin;
}
