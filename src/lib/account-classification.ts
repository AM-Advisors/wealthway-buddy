/**
 * Account classification (Stage 2.8). Pure rules; the server records
 * classifications append-only and the database re-checks privileged inserts.
 * Classification is always explicit — never inferred from an email prefix.
 */
export const ACCOUNT_CLASSIFICATIONS = ["individual", "shared_inbox", "service_account", "integration_account"] as const;
export type AccountClassification = (typeof ACCOUNT_CLASSIFICATIONS)[number];

export const CLASSIFICATION_LABEL: Record<AccountClassification, string> = {
  individual: "Individual",
  shared_inbox: "Shared Inbox",
  service_account: "Service Account",
  integration_account: "Integration Account",
};

/** Role keys that confer global Harmonious administration. Global scope only. */
export const PRIVILEGED_ROLE_KEYS = new Set([
  "super_admin", "super_administrator", "admin", "operations_administrator", "access_administrator", "staff_administrator",
]);
/** Legacy platform roles treated as privileged administration. */
export const PRIVILEGED_PLATFORM_ROLES = ["super_admin", "admin"];

export function isPrivilegedRole(roleKey: string, scopeType = "global"): boolean {
  return scopeType === "global" && PRIVILEGED_ROLE_KEYS.has(roleKey);
}

/** Why a privileged role can't go to this account, or null if it can. */
export function privilegedAssignmentProblem(roleKey: string, scopeType: string, classification: AccountClassification | null): string | null {
  if (!isPrivilegedRole(roleKey, scopeType)) return null;
  if (!classification) return "Classify this account as Individual before assigning a privileged Harmonious role.";
  if (classification === "shared_inbox") return "Shared Inbox accounts can't hold privileged Harmonious roles; assign the role to a named individual.";
  if (classification === "integration_account") return "Integration accounts can't hold privileged Harmonious roles.";
  if (classification === "service_account") return "Service accounts receive only specifically approved non-human capabilities, never human administrative or approval authority.";
  return null;
}

/** Why a classification change is refused (e.g. account still holds privileged roles). */
export function classificationChangeProblem(next: AccountClassification, heldPrivileged: string[]): string | null {
  if (next !== "individual" && heldPrivileged.length) {
    return `Remove ${heldPrivileged.join(", ")} before classifying this account as ${CLASSIFICATION_LABEL[next]}.`;
  }
  return null;
}

export function currentClassification(rows: { user_id: string; classification: string; created_at: string }[], userId: string): AccountClassification | null {
  const mine = rows.filter((r) => r.user_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (mine[0]?.classification as AccountClassification | undefined) ?? null;
}

/**
 * Explicit proposals awaiting confirmation. Only info@harmonious.co is proposed
 * (by exact user ID); nothing is saved until an administrator confirms.
 */
export const CLASSIFICATION_PROPOSALS: Record<string, { classification: AccountClassification; note: string }> = {
  "c201d7b1-0d86-4ba5-a60c-032b0d1a22e3": { classification: "shared_inbox", note: "Proposed in Stage 2.8: info@harmonious.co is a shared inbox. Confirm to record." },
};
