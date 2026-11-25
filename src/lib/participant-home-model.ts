export type ParticipantHomeRow = {
  email: string;
  role: string;
  status: string;
  removed_at?: string | null;
};

/** Mirrors the exact-email entry rules; being an owner or CC recipient grants nothing. */
export function visibleParticipantAssignment(row: ParticipantHomeRow, email: string): boolean {
  return Boolean(email.trim()) && row.email.trim().toLowerCase() === email.trim().toLowerCase()
    && (row.role === "preparer" || row.role === "contact")
    && (row.status === "invited" || row.status === "active") && !row.removed_at;
}

/** Account entry recognizes only a live assignment to a live investment, not fund-wide access. */
export function eligibleParticipantInvitation(row: ParticipantHomeRow & {
  investor_onboardings?: { removed_at?: string | null; merged_into_onboarding_id?: string | null; stage: string } | null;
}, email: string): boolean {
  const investment = row.investor_onboardings;
  return visibleParticipantAssignment(row, email) && Boolean(investment
    && !investment.removed_at && !investment.merged_into_onboarding_id
    && !["declined", "cancelled"].includes(investment.stage));
}