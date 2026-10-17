/** Who may approve an authenticator reset. One administrator is enough (user decision, Oct 2026),
 * but nobody may approve a reset of their own account. */
export function canApproveMfaReset(r: { status: string; target_user_id: string }, deciderId: string): boolean {
  return r.status === "pending" && r.target_user_id !== deciderId;
}
