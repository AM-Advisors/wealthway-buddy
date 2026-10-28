import type { FundClass } from "@/lib/fund-setup-canonical";

/**
 * Amount-range class selection. A class with a minimum (and optional exclusive
 * maximum) applies to commitments inside that range. When more than one class
 * fits (e.g. Series A-3 and Series B at $250,000+), the fund manager or
 * Harmonious must choose; the investor never picks it implicitly.
 */
export type ClassPick =
  | { status: "no_ranges" }
  | { status: "no_amount" }
  | { status: "below_minimum"; minimumCents: number }
  | { status: "assigned"; key: string }
  | { status: "choose"; keys: string[] };

export function hasRanges(classes: FundClass[]): boolean {
  return classes.some((c) => c.minInvestmentCents != null || c.maxInvestmentCents != null);
}

export function classFitsAmount(c: FundClass, cents: number): boolean {
  if (c.minInvestmentCents != null && cents < c.minInvestmentCents) return false;
  if (c.maxInvestmentCents != null && cents >= c.maxInvestmentCents) return false;
  return true;
}

export function classForAmount(classes: FundClass[], cents: number | null | undefined): ClassPick {
  if (!hasRanges(classes)) return { status: "no_ranges" };
  if (cents == null || !Number.isFinite(cents) || cents <= 0) return { status: "no_amount" };
  const fits = classes.filter((c) => classFitsAmount(c, cents)).map((c) => c.key);
  if (fits.length === 1) return { status: "assigned", key: fits[0] };
  if (fits.length > 1) return { status: "choose", keys: fits };
  const mins = classes.map((c) => c.minInvestmentCents).filter((m): m is number => m != null);
  return { status: "below_minimum", minimumCents: mins.length ? Math.min(...mins) : 0 };
}

/**
 * The class an investment signs with: a recorded choice that still fits the
 * amount wins; otherwise the single class the amount falls into.
 */
export function resolveSigningClass(classes: FundClass[], cents: number | null | undefined, recordedKey: string | null | undefined): ClassPick {
  const pick = classForAmount(classes, cents);
  if (pick.status === "choose" && recordedKey && pick.keys.includes(recordedKey)) return { status: "assigned", key: recordedKey };
  return pick;
}

/** "A" or "B" from a series name, used for the separate amount lines on the signature page. */
export function seriesGroup(name: string | null | undefined): "A" | "B" | null {
  const m = /series\s+([ab])/i.exec(name ?? "");
  return m ? (m[1].toUpperCase() as "A" | "B") : null;
}
