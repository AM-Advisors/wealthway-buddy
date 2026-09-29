/**
 * Related-person (owner / control person / signer / trustee) matching rules.
 * Possible match ≠ automatic merge. Pure; no candidate details leave the server.
 */
export type RelatedMatchKind = "none" | "possible" | "ambiguous";
export type RelatedResolution = "use_existing" | "keep_new" | "review_later";

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export type RelatedCandidate = { id: string; email: string | null; firstName: string | null; lastName: string | null };

/** A candidate counts when the normalized email matches, or the full legal name matches exactly. */
export function relatedCandidateMatches(input: { email?: string | null; firstName: string; lastName: string }, c: RelatedCandidate) {
  const email = norm(input.email);
  if (email && norm(c.email) === email) return true;
  return norm(c.firstName) === norm(input.firstName) && norm(c.lastName) === norm(input.lastName) && norm(input.firstName) !== "";
}

export function classifyRelatedMatch(candidateIds: string[]): RelatedMatchKind {
  const unique = [...new Set(candidateIds)];
  return unique.length === 0 ? "none" : unique.length === 1 ? "possible" : "ambiguous";
}

/** "Use existing" may only pick a candidate the server itself found. */
export function resolutionError(res: RelatedResolution, chosen: string | null | undefined, candidates: string[]): string | null {
  if (res !== "use_existing") return null;
  if (!chosen) return "Choose which existing person to use.";
  if (!candidates.includes(chosen)) return "That person was not one of the matched candidates.";
  return null;
}

/** Neutral investor/manager-facing wording. Never reveals matching details. */
export const RELATED_REVIEW_MESSAGE =
  "Harmonious is reviewing an ownership or signer record. No action is required from you right now.";
