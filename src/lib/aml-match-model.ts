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
