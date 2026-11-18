/**
 * Resolves the id in a View account address to the login account it belongs to.
 * Search results and older links may carry a person record id instead of the
 * login account id; activity is recorded against the login account only.
 */
export type AccountSubject =
  | { kind: "account"; userId: string }
  | { kind: "person_with_login"; userId: string }
  | { kind: "person_without_login"; name: string; email: string | null }
  | { kind: "unknown" };

export function resolveAccountSubject(
  id: string,
  facts: { loginExists: boolean; person: { user_id: string | null; legal_first_name?: string | null; legal_last_name?: string | null; preferred_name?: string | null; email?: string | null } | null },
): AccountSubject {
  if (facts.loginExists) return { kind: "account", userId: id };
  const p = facts.person;
  if (!p) return { kind: "unknown" };
  if (p.user_id) return { kind: "person_with_login", userId: p.user_id };
  const name = (p.preferred_name?.trim() || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ")).trim();
  return { kind: "person_without_login", name, email: p.email ?? null };
}
