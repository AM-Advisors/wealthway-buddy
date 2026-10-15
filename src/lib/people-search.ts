/**
 * Search matching for the People & Access directory.
 * A query matches a person by name, email or their connected fund names
 * (the "All funds" marker counts only when the query also matches a real
 * fund name), an invitation by name, email or its fund name, and
 * directory fund options by fund name.
 */
export function matchesPerson(
  person: { name?: string; email?: string; funds?: string[] },
  query: string,
  opts?: { matchAllFundsMarker?: boolean },
): boolean {
  const s = query.toLowerCase();
  if (!s) return true;
  const funds = (person.funds ?? []).filter((f) => f !== "All funds");
  if (opts?.matchAllFundsMarker && (person.funds ?? []).includes("All funds")) return true;
  const hay = `${person.name ?? ""} ${person.email ?? ""} ${funds.join(" ")}`.toLowerCase();
  return hay.includes(s);
}

export function matchesInvite(invite: { name?: string | null; email?: string; fundName?: string | null }, query: string): boolean {
  const s = query.toLowerCase();
  if (!s) return true;
  const hay = `${invite.name ?? ""} ${invite.email ?? ""} ${invite.fundName ?? ""}`.toLowerCase();
  return hay.includes(s);
}

export function matchFundOptions(options: { id: string; name: string }[], query: string): { id: string; name: string }[] {
  const s = query.toLowerCase();
  if (!s) return [];
  return options.filter((o) => o.name.toLowerCase().includes(s));
}
