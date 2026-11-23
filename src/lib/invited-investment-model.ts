/**
 * Pure rules for listing an invited investor right away (no I/O).
 * Every investor invitation (quick invite, several by email, prepared drafts,
 * fund access invites) puts one canonical investment on the fund roster with
 * status "Invited / not started" instead of waiting for the person to click.
 */

export type InvitedPersonCandidate = { id: string; userId: string | null };
export type OpenInvestment = { id: string; invitationId: string | null };

export type InvitedInvestmentPlan =
  | { kind: "existing"; onboardingId: string; attachInvitation: boolean }
  | { kind: "create"; personId: string | null; createPerson: boolean; investorUserId: string | null }
  | { kind: "ambiguous" };

/**
 * existing: an open investment in this fund already belongs to this email/login, so reuse it
 *   (attach the onboarding invitation only when it has none and there is exactly one).
 * create: reuse the one person with this exact email (or the invited login's own person),
 *   otherwise create a new unclaimed person.
 * ambiguous: several people share the email; nothing is guessed (the invitation still shows
 *   in the Invited list and sign-in opens the existing Harmonious review).
 */
export function planInvitedInvestment(input: {
  open: OpenInvestment[];
  candidates: InvitedPersonCandidate[];
  knownUserId: string | null;
  ownPersonId: string | null;
  hasOnboardingInvitation: boolean;
}): InvitedInvestmentPlan {
  const first = input.open[0];
  if (first) {
    return { kind: "existing", onboardingId: first.id, attachInvitation: input.hasOnboardingInvitation && input.open.length === 1 && !first.invitationId };
  }
  if (input.knownUserId) {
    // The login already exists: use its own person when there is one; never adopt someone else's.
    return { kind: "create", personId: input.ownPersonId, createPerson: false, investorUserId: input.knownUserId };
  }
  const claimed = input.candidates.filter((c) => c.userId);
  const unclaimed = input.candidates.filter((c) => !c.userId);
  if (claimed.length === 0 && unclaimed.length === 0) return { kind: "create", personId: null, createPerson: true, investorUserId: null };
  if (claimed.length === 1 && unclaimed.length === 0) return { kind: "create", personId: claimed[0]!.id, createPerson: false, investorUserId: claimed[0]!.userId };
  if (claimed.length === 0 && unclaimed.length === 1) return { kind: "create", personId: unclaimed[0]!.id, createPerson: false, investorUserId: null };
  return { kind: "ambiguous" };
}

/** "Jane Q Doe" → first "Jane", last "Q Doe"; one word → first name only; blank → nothing. */
export function splitInvitedName(name: string | null | undefined): { firstName: string | null; lastName: string | null } {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: null, lastName: null };
  return { firstName: parts[0]!, lastName: parts.length > 1 ? parts.slice(1).join(" ") : null };
}
