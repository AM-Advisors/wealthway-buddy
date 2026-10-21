import type { AccountFeedKind, FeedAccount, ProviderHolding, ProviderSecurity } from './account-aggregation';

export class AccountFeedError extends Error {
  constructor(public code: string, public status: number) { super('Account information could not be updated. Please try again.'); }
}
export function accountFeedConfiguration() {
  const configured = Boolean(process.env['PLAID_CLIENT_ID'] && process.env['PLAID_SECRET'] && process.env['APP_USER_CONNECTION_KEY_SECRET']);
  return { configured, testMode: process.env['PLAID_ENV'] !== 'production' };
}
// Deliberate allowlist: no Auth numbers, transactions, transfer or payment endpoints.
const READ_ONLY_PATHS = new Set(['/link/token/create', '/item/public_token/exchange', '/accounts/balance/get', '/investments/holdings/get', '/item/get', '/item/remove']);
async function request<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!READ_ONLY_PATHS.has(path)) throw new Error('Unsupported account feed operation.');
  const clientId = process.env['PLAID_CLIENT_ID'], secret = process.env['PLAID_SECRET'];
  if (!clientId || !secret) throw new Error('Account connections are not configured yet.');
  const base = process.env['PLAID_ENV'] === 'production' ? 'https://production.plaid.com' : 'https://sandbox.plaid.com';
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, secret, ...body }) });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error_code?: string } | null;
    const code = error?.error_code ?? 'REQUEST_FAILED';
    console.error('[account-feed]', response.status, code);
    throw new AccountFeedError(code, response.status);
  }
  return response.json() as Promise<T>;
}
export function startAccountFeedLink(ownerId: string, kind: AccountFeedKind, accessToken?: string) {
  return request<{ link_token: string }>('/link/token/create', {
    user: { client_user_id: ownerId }, client_name: 'Harmonious', country_codes: ['US'], language: 'en',
    ...(accessToken ? { access_token: accessToken } : { products: [kind === 'bank' ? 'transactions' : 'investments'], account_filters: kind === 'bank' ? { depository: { account_subtypes: ['all'] } } : { investment: { account_subtypes: ['all'] } } }),
    webhook: 'https://app.harmonious.co/api/public/plaid-webhook',
    ...(process.env['PLAID_REDIRECT_URI'] ? { redirect_uri: process.env['PLAID_REDIRECT_URI'] } : {}),
  });
}
export function exchangeAccountFeedToken(publicToken: string) {
  return request<{ access_token: string; item_id: string }>('/item/public_token/exchange', { public_token: publicToken });
}
export function readAccountFeedItem(accessToken: string) {
  return request<{ item: { item_id: string; consented_products?: string[]; available_products?: string[] } }>('/item/get', { access_token: accessToken });
}
export async function readAccountFeed(accessToken: string, kind: AccountFeedKind) {
  if (kind === 'bank') {
    const result = await request<{ accounts: FeedAccount[] }>('/accounts/balance/get', { access_token: accessToken });
    return { accounts: result.accounts, holdings: [] as ProviderHolding[], securities: [] as ProviderSecurity[] };
  }
  return request<{ accounts: FeedAccount[]; holdings: ProviderHolding[]; securities: ProviderSecurity[] }>('/investments/holdings/get', { access_token: accessToken });
}
export function revokeAccountFeed(accessToken: string) { return request('/item/remove', { access_token: accessToken }); }