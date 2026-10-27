export function mayGenerateFundDocuments(isStaff: boolean, managesFund: boolean, level: unknown): boolean {
  return isStaff || (managesFund && (level == null || level === "self_serve"));
}

export function generatedDocumentReviewError(v: { created_by: string; version: number; self_serve_review_state?: string | null; generation_issues?: string[] }, reviewer: string, currentVersion: number): string | null {
  if (v.created_by === reviewer) return "Another authorized person must review this draft.";
  if (v.version !== currentVersion) return "Review the current version, not an earlier draft.";
  if (v.self_serve_review_state !== "pending") return "This draft has already been reviewed. Create a new version for changes.";
  if (v.generation_issues?.length) return "Resolve the missing fields or conflicting legal terms in a new version before approval.";
  return null;
}