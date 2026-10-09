/**
 * Pure pre-allocation readiness gate. Lists every reason investor allocations
 * may not be calculated or posted yet. It never fills a gap with an assumption.
 */
export type ReadinessPosition = {
  positionId: string;
  offeringId: string;
  classId: string | null;
  openingCapitalCents: number | null;
  openingCapitalSourced: boolean;
};

export type ReadinessInput = {
  offeringId: string;
  fundOpeningNetAssetsCents: number;
  positions: ReadinessPosition[];
  approvedAllocationPolicy: boolean;
  navApprovalScope: string | null;
  navPublished: boolean;
  /** Fee lines traced per investor from the approved fee run, if any. */
  feeLineTotalCents: number | null;
  postedFeeExpenseCents: number;
  /** Side-letter terms that are not approved must not change economics. */
  unapprovedSideLetterTermsApplied: number;
  carryAllocatedCents: number;
  approvedWaterfallTerms: boolean;
};

export function allocationReadinessBlockers(i: ReadinessInput): string[] {
  const out: string[] = [];
  if (!i.approvedAllocationPolicy) out.push("No approved allocation policy for this fund.");
  const missing = i.positions.filter((p) => p.openingCapitalCents === null || !p.openingCapitalSourced);
  if (missing.length > 0) out.push(`Opening capital not supported for ${missing.length} investor(s).`);
  const opening = i.positions.reduce((s, p) => s + (p.openingCapitalCents ?? 0), 0);
  if (missing.length === 0 && opening !== i.fundOpeningNetAssetsCents) {
    out.push(`Opening investor capital ${opening} cents does not equal fund opening net assets ${i.fundOpeningNetAssetsCents} cents.`);
  }
  if (i.positions.some((p) => p.offeringId !== i.offeringId)) out.push("An investor position belongs to a different fund.");
  if (i.navApprovalScope === "internal_synthetic_only" || !i.navPublished) {
    out.push("Only a published production NAV may feed production capital accounts.");
  }
  if (i.feeLineTotalCents !== null && i.feeLineTotalCents !== i.postedFeeExpenseCents) {
    out.push(`Traced fee lines ${i.feeLineTotalCents} cents do not equal posted fee expense ${i.postedFeeExpenseCents} cents.`);
  }
  if (i.unapprovedSideLetterTermsApplied > 0) out.push("Unapproved side-letter terms cannot change investor economics.");
  if (i.carryAllocatedCents !== 0 && !i.approvedWaterfallTerms) out.push("Carried interest needs approved waterfall terms.");
  return out;
}
