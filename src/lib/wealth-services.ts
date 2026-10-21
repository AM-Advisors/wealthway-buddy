export const WEALTH_SERVICES = [
  { key: 'portfolio', label: 'Portfolio', detail: 'Holdings, valuations, exposure and monitoring' },
  { key: 'report_cards', label: 'Report Cards', detail: 'Risk questionnaires, evidence and review history' },
] as const;
export type WealthServiceKey = typeof WEALTH_SERVICES[number]['key'];
export const WEALTH_ASSET_CLASSES = ['cash', 'public_equity', 'fixed_income', 'private_fund', 'real_estate', 'business', 'other'] as const;
export type WealthObservation = { id: string; holding_id: string; supersedes_id: string | null; owner_user_id: string; name: string; asset_class: string; currency: string; cost_cents: number | null; value_cents: number | null; as_of: string; source_note: string; archived: boolean; created_at: string };
export function currentWealthHoldings(rows: WealthObservation[], ownerId: string, date: string) {
  const eligible = rows.filter(r => r.owner_user_id === ownerId && r.as_of <= date);
  const superseded = new Set(eligible.map(r => r.supersedes_id).filter(Boolean));
  return eligible.filter(r => !superseded.has(r.id) && !r.archived);
}
export function wealthScopeAllowed(actorId: string, ownerId: string, offeringId: string | null, managedIds: string[]) {
  return actorId === ownerId && (offeringId === null || managedIds.includes(offeringId));
}