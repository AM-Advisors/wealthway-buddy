/** Authorization precedes all privileged diagnostic reads. */
export async function authorizeEmailDiagnostics(db: any, userId: string, input: { recipient?: string; applicationId?: string }) {
  const roles = await db.from("user_roles").select("role").eq("user_id", userId);
  if (roles.error) throw new Error("Email diagnostic access could not be checked.");
  if ((roles.data ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "super_admin")) return { admin: true };
  // Recipient-only histories span messages from unrelated funds. Managers use
  // the existing onboarding-scoped investor email history instead.
  throw new Error("Forbidden: email diagnostics require Harmonious administrator access. Use the fund's investor email history for scoped delivery updates.");
}