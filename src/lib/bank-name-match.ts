/** Does a bank account owner name match the investing party? Pure, browser-safe. */
const SUFFIX = new Set(["jr", "sr", "ii", "iii", "iv", "llc", "lp", "inc", "trust", "the", "co", "corp", "ltd"]);

export function nameTokens(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t && !SUFFIX.has(t));
}

/**
 * True when some owner name contains every word of some expected name (order-free; suffixes like Jr/LLC ignored),
 * or the reverse. Middle names on the bank side are fine. Empty inputs never match.
 */
export function bankOwnerMatches(owners: readonly string[], expected: readonly string[]): boolean {
  for (const o of owners) {
    const ot = new Set(nameTokens(o));
    if (!ot.size) continue;
    for (const e of expected) {
      const et = nameTokens(e);
      if (!et.length) continue;
      if (et.every((t) => ot.has(t)) || [...ot].every((t) => et.includes(t))) return true;
    }
  }
  return false;
}
