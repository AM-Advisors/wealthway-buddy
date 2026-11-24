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