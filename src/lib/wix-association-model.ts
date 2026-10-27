/** Pure rules for staff associations of Wix staging records. Latest recorded association wins; name matches are suggestions only. */
export type WixAssociation = { kind: "fund" | "investment"; wix_id: string; offering_id: string | null; wix_fund_id: string | null; created_at: string };

export function latestAssociations(rows: WixAssociation[], kind: WixAssociation["kind"]): Map<string, WixAssociation> {
  const out = new Map<string, WixAssociation>();
  for (const r of rows) {
    if (r.kind !== kind) continue;
    const prev = out.get(r.wix_id);
    if (!prev || r.created_at > prev.created_at) out.set(r.wix_id, r);
  }
  return out;
}

/** Which Wix fund an investment belongs to: a staff assignment overrides the imported link. */
export function effectiveWixFundId(importedFundId: string | null, assoc: WixAssociation | undefined): string | null {
  return assoc ? assoc.wix_fund_id : importedFundId;
}

export type FundMatch = { id: string; name: string; source: "confirmed" | "suggested" } | null;

/** Harmonious fund for a Wix fund: confirmed staff choice (including "none") beats a name suggestion. */
export function resolveFundMatch(
  suggestion: { id: string; name: string } | null,
  assoc: WixAssociation | undefined,
  nameOf: (id: string) => string | undefined,
): { match: FundMatch; confirmedNone: boolean } {
  if (assoc) {
    if (!assoc.offering_id) return { match: null, confirmedNone: true };
    return { match: { id: assoc.offering_id, name: nameOf(assoc.offering_id) ?? "(fund)", source: "confirmed" }, confirmedNone: false };
  }
  return { match: suggestion ? { ...suggestion, source: "suggested" } : null, confirmedNone: false };
}
