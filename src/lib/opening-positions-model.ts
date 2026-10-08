/**
 * Takeover opening positions: investments that existed before Harmonious became
 * administrator. They initialise the investment subledger ONLY; the posted opening
 * journal already carries their cost and appreciation, so no new accounting is created.
 */
export type OpeningPositionInput = {
  costBasisCents: number;
  openingFairValueCents: number;
  evidenceStatus: "present" | "missing_in_source" | "review_required";
  asOfDate: string;
};
export type OpeningJournalFacts = { status: string; entryDate: string; bookId: string };

export function openingPositionError(i: OpeningPositionInput, journal: OpeningJournalFacts | null, fundBookId: string): string | null {
  if (!journal) return "Name the posted opening journal that already carries this position.";
  if (journal.bookId !== fundBookId) return "That opening journal belongs to a different fund.";
  if (journal.status !== "posted") return "The opening journal must be posted.";
  if (journal.entryDate !== i.asOfDate) return "The position's as-of date must equal the opening journal date.";
  if (!(i.costBasisCents >= 0) || !(i.openingFairValueCents >= 0)) return "Cost and fair value must be non-negative.";
  return null;
}

export function openingDecisionError(preparedBy: string, deciderId: string, status: string): string | null {
  if (status !== "prepared") return "This opening position has already been decided.";
  if (preparedBy === deciderId) return "The person who prepared an opening position cannot approve it.";
  return null;
}

/** Subledger must tie to the GL on cost, fair value and unrealised, to the cent. */
export function openingTieOut(positions: { costBasisCents: number; openingFairValueCents: number }[], gl: { investmentCostCents: number; unrealizedCents: number }) {
  const cost = positions.reduce((s, p) => s + p.costBasisCents, 0);
  const fv = positions.reduce((s, p) => s + p.openingFairValueCents, 0);
  const unrealized = fv - cost;
  const r = {
    cost: { subledger: cost, gl: gl.investmentCostCents, diff: cost - gl.investmentCostCents },
    fairValue: { subledger: fv, gl: gl.investmentCostCents + gl.unrealizedCents, diff: fv - (gl.investmentCostCents + gl.unrealizedCents) },
    unrealized: { subledger: unrealized, gl: gl.unrealizedCents, diff: unrealized - gl.unrealizedCents },
  };
  return { ...r, ties: r.cost.diff === 0 && r.fairValue.diff === 0 && r.unrealized.diff === 0 };
}

/**
 * Q1 unrealised movement is measured from the last RECOGNISED value. An opening
 * position's fair value was recognised by the opening journal, so Q1 never re-books it.
 */
export function unrealizedMovementCents(lastRecognizedCents: number | null, costCents: number, newValueCents: number) {
  return newValueCents - (lastRecognizedCents ?? costCents);
}
