/**
 * Related-person (owner / control person / signer / trustee) matching rules.
 * Possible match ≠ automatic merge. Pure; no candidate details leave the server.
 */
export type RelatedMatchKind = "none" | "possible" | "ambiguous";
export type RelatedResolution = "use_existing" | "keep_new" | "review_later";

import { candidateSignals } from "@/lib/person-resolution";

export type RelatedCandidate = { id: string; email: string | null; firstName: string | null; lastName: string | null };

/** Delegates to the canonical Person Resolution signals (email or full legal name). */
export function relatedCandidateMatches(input: { email?: string | null; firstName: string; lastName: string }, c: RelatedCandidate) {
  const sig = candidateSignals(input, c);
  return sig.includes("email") || sig.includes("name");
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
