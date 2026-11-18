/**
 * Pure: which documents signed outside the platform still need their own row on the
 * investor record's "Documents & signed agreements" card. Active copies show unless a
 * fund signature document of the same type already shows them as signed outside.
 * Replaced or undone copies stay retained in "Signed before joining Harmonious".
 */
export type OutsideDocLite = { id: string; kind: string; replaced: boolean; withdrawn: boolean };
export type SlotLite = { docType: string | null; outsideSigned: unknown };

export function outsideDocsForRecord<T extends OutsideDocLite>(priors: readonly T[], slots: readonly SlotLite[]): T[] {
  const covered = new Set(slots.filter((s) => s.outsideSigned && s.docType).map((s) => s.docType as string));
  return priors.filter((p) => !p.replaced && !p.withdrawn && !covered.has(p.kind));
}
