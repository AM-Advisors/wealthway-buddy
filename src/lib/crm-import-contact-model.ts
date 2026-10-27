export type ImportContactCandidate = { id: string; full_name: string; email: string | null };
/** Email alone is a review candidate, never permission to merge records or adopt an identity. */
export function importContactDecision(linkedId: string | null, candidates: ImportContactCandidate[]) {
  if (linkedId) return { kind: "linked" as const, contactId: linkedId };
  if (candidates.length) return { kind: "review" as const, contactId: null };
  return { kind: "new" as const, contactId: null };
}