/** Pure rules for the investor-link deal review (before any commitment). */
export type ReviewDoc = { id: string; show_pre_commitment: boolean | null; archived_at: string | null; visibility?: string | null };

/** Only manager-chosen, live, non-internal documents show before commitment. */
export function preCommitmentDocs<T extends ReviewDoc>(docs: T[]): T[] {
  return docs.filter((d) => d.show_pre_commitment === true && !d.archived_at && d.visibility !== "internal");
}

/** Draft offering terms never show to investors. */
export function publishedTerms<T extends { is_published: boolean | null }>(s: T | null | undefined): T | null {
  return s && s.is_published === true ? s : null;
}

/** Documents unlock only when no NDA is required or the current version is accepted. */
export function documentsUnlocked(ndaRequired: boolean, accepted: boolean) {
  return !ndaRequired || accepted;
}
