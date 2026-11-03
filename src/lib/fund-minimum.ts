/** Current fund settings win; setup is only a legacy fallback. */
export function currentFundMinimum(offeringMinimum: unknown, setupMinimum: unknown): number {
  return Number(offeringMinimum ?? setupMinimum ?? 0);
}