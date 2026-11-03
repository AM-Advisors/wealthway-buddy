// Pure: compare one possible watchlist match with the verified person. Suggestions only; a person always decides.
export type MatchHit = { id?: string | null; caption: string | null; datasets: string[]; countries: string[]; birthDates: string[]; matchScore: number | null; pep: boolean; lists: string[]; summary: string | null };
export type Person = { fullName: string | null; dateOfBirth: string | null; country: string | null };
export type Verdict = "differs" | "same" | "unknown";
export type HitComparison = { key: string; caption: string | null; birth: Verdict; country: Verdict; suggestion: "likely_different_person" | "needs_close_look" };

export function hitKey(h: MatchHit): string {
  // Built from the match content, not a provider id, so clearances survive refreshed provider results.
  return `c:${(h.caption ?? "").toLowerCase()}|${h.birthDates.join(",")}|${h.datasets.join(",")}`;
}

const year = (s: string) => /(\d{4})/.exec(s)?.[1] ?? null;
const norm = (s: string) => s.trim().toLowerCase();

export function compareBirth(personDob: string | null, hitDates: string[]): Verdict {
  if (!personDob || !hitDates.length) return "unknown";
  const py = year(personDob);
  if (!py) return "unknown";
  if (hitDates.some((d) => d.slice(0, 10) === personDob.slice(0, 10) || (d.length === 4 && d === py))) return "same";
  return hitDates.every((d) => year(d) && year(d) !== py) ? "differs" : "unknown";
}

export function compareCountry(personCountry: string | null, hitCountries: string[]): Verdict {
  if (!personCountry || !hitCountries.length) return "unknown";
  const p = norm(personCountry);
  return hitCountries.some((c) => { const n = norm(c); return n === p || p.startsWith(n) || n.startsWith(p); }) ? "same" : "differs";
}

/** A match is suggested as "likely a different person" only when birth year differs and it is not a politically exposed person. */
export function compareHit(person: Person, h: MatchHit): HitComparison {
  const birth = compareBirth(person.dateOfBirth, h.birthDates);
  const country = compareCountry(person.country, h.countries);
  return { key: hitKey(h), caption: h.caption, birth, country, suggestion: birth === "differs" && !h.pep ? "likely_different_person" : "needs_close_look" };
}

/** Approval of a check with possible matches requires every recorded match to be cleared. */
export function unclearedHits(hits: MatchHit[], clearedKeys: Iterable<string>): string[] {
  const done = new Set(clearedKeys);
  return hits.map(hitKey).filter((k) => !done.has(k));
}

/**
 * Automatic screening decision. Clears only a completed screening whose every possible
 * match is a likely different person (birth year differs, not politically exposed).
 * Anything else stays in review and is routed to Harmonious and the fund manager.
 */
export function autoScreeningDecision(input: { completed: boolean; person: Person; hits: MatchHit[] }): "auto_clear" | "review" {
  if (!input.completed) return "review";
  if (!input.person.dateOfBirth) return input.hits.length === 0 ? "auto_clear" : "review";
  return input.hits.every((h) => compareHit(input.person, h).suggestion === "likely_different_person") ? "auto_clear" : "review";
}

/**
 * Provider-resolved look-alikes: the screening service itself marked the hit as not a match
 * or a false positive. These never hold an investor in review; every other hit still does.
 */
export function providerRuledOut(h: any): boolean {
  if (!h || typeof h !== "object") return false;
  if (h.match === false) return true;
  if (h.is_false_positive === true) return true;
  return /false[\s_-]*positive|not[\s_-]*a?[\s_-]*match/i.test(String(h.review_status ?? ""));
}

export function unresolvedAmlHits<T>(hits: T[] | null | undefined): T[] {
  return (Array.isArray(hits) ? hits : []).filter((h) => !providerRuledOut(h));
}
