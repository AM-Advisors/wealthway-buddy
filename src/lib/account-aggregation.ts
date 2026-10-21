export const ACCOUNT_FEED_CONSENT_VERSION = '2026-10-21';
export type AccountFeedKind = 'bank' | 'brokerage';
export type FeedHolding = {
  securityId: string; name: string; ticker: string | null; quantity: number | null;
  valueCents: number | null; costCents: number | null; currency: string | null; priceAsOf: string | null;
};
export type FeedAccount = {
  account_id: string; name: string; mask: string | null; type: string; subtype?: string | null;
  balances: { current: number | null; available: number | null; iso_currency_code?: string | null; last_updated_datetime?: string | null };
};
export type ProviderHolding = {
  account_id: string; security_id: string; quantity: number | null; institution_value: number | null;
  cost_basis: number | null; iso_currency_code: string | null; institution_price_as_of?: string | null;
};
export type ProviderSecurity = { security_id: string; name: string | null; ticker_symbol: string | null };
export type AccountSnapshot = {
  id?: string; connection_id: string; owner_user_id: string; provider_account_id: string;
  account_name: string; account_mask: string | null; account_type: string; account_subtype: string | null;
  currency: string; current_balance_cents: number | null; available_balance_cents: number | null;
  holdings: FeedHolding[]; provider_as_of: string | null; observed_at: string;
};
export function feedOwnerAllowed(actor: string, owner: string) { return Boolean(actor) && actor === owner; }
export function amountToCents(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}
export function normalizeAccountFeed(ownerId: string, connectionId: string, kind: AccountFeedKind, accounts: FeedAccount[], holdings: ProviderHolding[], securities: ProviderSecurity[], observedAt: string) {
  const lookup = new Map(securities.map(s => [s.security_id, s]));
  let omitted = 0;
  const snapshots: AccountSnapshot[] = [];
  for (const account of accounts) {
    if (account.type !== (kind === 'bank' ? 'depository' : 'investment')) continue;
    const currency = account.balances.iso_currency_code;
    if (!currency || !/^[A-Z]{3}$/.test(currency)) { omitted++; continue; }
    snapshots.push({ connection_id: connectionId, owner_user_id: ownerId, provider_account_id: account.account_id,
      account_name: account.name, account_mask: account.mask, account_type: account.type, account_subtype: account.subtype ?? null,
      currency, current_balance_cents: amountToCents(account.balances.current), available_balance_cents: amountToCents(account.balances.available),
      provider_as_of: account.balances.last_updated_datetime ?? null, observed_at: observedAt,
      holdings: holdings.filter(h => h.account_id === account.account_id).map(h => ({ securityId: h.security_id,
        name: lookup.get(h.security_id)?.name ?? 'Unnamed security', ticker: lookup.get(h.security_id)?.ticker_symbol ?? null,
        quantity: h.quantity, valueCents: amountToCents(h.institution_value), costCents: amountToCents(h.cost_basis),
        currency: h.iso_currency_code && /^[A-Z]{3}$/.test(h.iso_currency_code) ? h.iso_currency_code : null,
        priceAsOf: h.institution_price_as_of ?? null,
      })),
    });
  }
  return { snapshots, omitted };
}
// A refresh is a complete account set: removed accounts must not survive a newer batch.
export function latestFeedSnapshots(rows: AccountSnapshot[], ownerId: string, through: string, connections: { id: string; status: string; last_synced_at: string | null }[]) {
  const active = new Map(connections.filter(c => c.status !== 'disconnected').map(c => [c.id, c]));
  const eligible = rows.filter(r => feedOwnerAllowed(ownerId, r.owner_user_id) && active.has(r.connection_id) && r.observed_at <= through);
  const newest = new Map<string, string>();
  for (const r of eligible) if ((newest.get(r.connection_id) ?? '') < r.observed_at) newest.set(r.connection_id, r.observed_at);
  return eligible.filter(r => r.observed_at === newest.get(r.connection_id));
}
// Account values already include brokerage positions and cash. Never add security values again.
export function feedTotals(rows: AccountSnapshot[]) {
  return [...new Set(rows.map(r => r.currency))].map(currency => {
    const accounts = rows.filter(r => r.currency === currency);
    return { currency, valueCents: accounts.every(r => r.current_balance_cents !== null) ? accounts.reduce((n, r) => n + Number(r.current_balance_cents), 0) : null };
  });
}