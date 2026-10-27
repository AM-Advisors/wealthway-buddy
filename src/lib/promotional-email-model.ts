/** Promotional eligibility is separate from transactional document and security notices. */
export const normalizePromotionalEmail = (email: string) => email.trim().toLowerCase();
export function promotionalEmailAllowed(input: { consent: string; suppressed: boolean; archived: boolean; bulk: boolean }): boolean {
  return !input.suppressed && !input.archived && input.consent !== "unsubscribed" && (!input.bulk || input.consent === "opted_in");
}