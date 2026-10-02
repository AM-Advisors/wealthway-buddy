/**
 * Canonical Person Resolution (Phase 3.8) - pure rules. Every Person-creation
 * path (manual entry, bulk, related persons, sign-in claim, Records Sync) uses
 * this one algorithm. Callers may present outcomes differently and keep their
 * own, stricter authorization; they must not re-implement matching.
 *
 * Email is a signal, not identity. Name alone is never Exact. Nothing here
 * merges, and full SSN/TIN is never a matching input.
 */

export type PersonResolutionOutcome = "exact_match" | "possible_match" | "no_match" | "ambiguous" | "conflict";

export const PERSON_RESOLUTION_LABELS: Record<PersonResolutionOutcome, string> = {
  exact_match: "Exact Match",
  possible_match: "Possible Match - Review Required",
  no_match: "No Match",
  ambiguous: "Ambiguous",
  conflict: "Conflict",
};

export type PersonSignals = {
  email?: string | null;
  /** Only true when the email belongs to a verified sign-in. */
  emailVerified?: boolean;
  firstName?: string | null;
  lastName?: string | null;
  /** "First Last" when separate parts aren't available. */
  fullName?: string | null;
  entityName?: string | null;
};

export type ResolutionCandidate = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  userId?: string | null;
  profileLegalNames?: (string | null)[];
};

export type SignalKind = "email" | "name" | "entity";
export type CandidateHit = { id: string; signals: SignalKind[] };

export type PersonResolution = {
  outcome: PersonResolutionOutcome;
  /** Distinct candidate Person ids behind the outcome (server-side only). */
  candidateIds: string[];
  /** Set only for exact_match. */
  personId: string | null;
  hits: CandidateHit[];
};

export const normEmail = (v: unknown) => String(v ?? "").trim().toLowerCase();
export const normName = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ");

export function splitName(full: string | null | undefined): { first: string; last: string } {
  const n = String(full ?? "").trim().replace(/\s+/g, " ");
  if (!n.includes(" ")) return { first: n, last: "" };
  return { first: n.slice(0, n.indexOf(" ")), last: n.slice(n.indexOf(" ") + 1) };
}

function inputName(s: PersonSignals): string {
  const first = s.firstName ?? (s.fullName ? splitName(s.fullName).first : "");
  const last = s.lastName ?? (s.fullName ? splitName(s.fullName).last : "");
  if (!normName(first) || !normName(last)) return "";
  return normName(`${first} ${last}`);
}

/** Which signals tie one candidate to the input. */
export function candidateSignals(s: PersonSignals, c: ResolutionCandidate): SignalKind[] {
  const out: SignalKind[] = [];
  const email = normEmail(s.email);
  if (email && normEmail(c.email) === email) out.push("email");
  const name = inputName(s);
  if (name && normName(`${c.firstName ?? ""} ${c.lastName ?? ""}`) === name) out.push("name");
  const entity = normName(s.entityName);
  if (entity && (c.profileLegalNames ?? []).some((n) => normName(n) === entity)) out.push("entity");
  return out;
}

/**
 * Exact: one candidate, tied by a verified email, or by email AND legal name.
 * Conflict: the email points to one Person but the supplied legal name clearly
 *   belongs to someone else (or to a different candidate).
 * Ambiguous: more than one distinct candidate.
 * Possible: one candidate on a weaker signal (email only, name only, entity).
 */
export function resolvePerson(s: PersonSignals, candidates: readonly ResolutionCandidate[]): PersonResolution {
  const hits: CandidateHit[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const sig = candidateSignals(s, c);
    if (sig.length) hits.push({ id: c.id, signals: sig });
  }
  const ids = hits.map((h) => h.id);
  if (!hits.length) return { outcome: "no_match", candidateIds: [], personId: null, hits };

  const name = inputName(s);
  const emailHits = hits.filter((h) => h.signals.includes("email"));
  const nameHits = hits.filter((h) => h.signals.includes("name"));
  // Email tied to one Person whose recorded name differs from the supplied name.
  if (emailHits.length === 1 && name) {
    const c = candidates.find((x) => x.id === emailHits[0]!.id)!;
    const recorded = normName(`${c.firstName ?? ""} ${c.lastName ?? ""}`);
    const nameElsewhere = nameHits.some((h) => h.id !== emailHits[0]!.id);
    if (nameElsewhere || (recorded && recorded !== name)) return { outcome: "conflict", candidateIds: ids, personId: null, hits };
  }
  if (hits.length > 1) return { outcome: "ambiguous", candidateIds: ids, personId: null, hits };
  const only = hits[0]!;
  const exact = only.signals.includes("email") && (Boolean(s.emailVerified) || only.signals.includes("name"));
  return exact
    ? { outcome: "exact_match", candidateIds: ids, personId: only.id, hits }
    : { outcome: "possible_match", candidateIds: ids, personId: null, hits };
}

/** True when a caller may create a new Person without an explicit "separate person" confirmation. */
export function mayCreateWithoutConfirmation(r: PersonResolution): boolean {
  return r.outcome === "no_match";
}

/** Outcomes that must become a Harmonious review rather than a guess. */
export function requiresReview(r: PersonResolution): boolean {
  return r.outcome === "possible_match" || r.outcome === "ambiguous" || r.outcome === "conflict";
}

/**
 * Manual creation: any existing candidate (email, legal name or entity) needs
 * the preparer to use the existing record or explicitly confirm a separate person.
 */
export function personCreationBlocker(r: PersonResolution, confirmedNew: boolean): string | null {
  if (confirmedNew || r.outcome === "no_match") return null;
  if (r.outcome === "exact_match" || r.hits.some((h) => h.signals.includes("email"))) {
    return "An investor with this email already exists. Use the existing record or confirm you are creating a separate person.";
  }
  return "An existing investor may be this person. Use the existing record or confirm you are creating a separate person.";
}

/** Deterministic lock key so concurrent creators of the same identity serialize. */
export function personCreationLockKey(s: PersonSignals): string | null {
  const email = normEmail(s.email);
  const name = inputName(s);
  if (!email && !name) return null;
  return `person:${email}|${name}`;
}
