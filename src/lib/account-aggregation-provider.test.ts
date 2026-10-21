import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountFeedConfiguration, readAccountFeed, startAccountFeedLink, AccountFeedError } from './account-aggregation-provider.server';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function configure() { vi.stubEnv('PLAID_CLIENT_ID', 'synthetic-client'); vi.stubEnv('PLAID_SECRET', 'synthetic-secret'); vi.stubEnv('PLAID_ENV', 'sandbox'); }
describe('account aggregation provider boundary', () => {
  it('only requests read-only bank initialization without account numbers or transfer permission', async () => {
    configure(); const fetcher = vi.fn().mockResolvedValue(Response.json({ link_token: 'synthetic-link' })); vi.stubGlobal('fetch', fetcher);
    await startAccountFeedLink('synthetic-owner', 'bank');
    const body = JSON.parse(fetcher.mock.calls[0]?.[1]?.body ?? '{}');
    expect(body.user.client_user_id).toBe('synthetic-owner'); expect(body.products).toEqual(['transactions']); expect(body.optional_products).toBeUndefined();
  });
  it('requires investments only for brokerage links', async () => {
    configure(); const fetcher = vi.fn().mockResolvedValue(Response.json({ link_token: 'synthetic-link' })); vi.stubGlobal('fetch', fetcher);
    await startAccountFeedLink('synthetic-owner', 'brokerage'); expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body ?? '{}').products).toEqual(['investments']);
  });
  it('uses update mode with the existing token rather than creating another item', async () => {
    configure(); const fetcher = vi.fn().mockResolvedValue(Response.json({ link_token: 'synthetic-link' })); vi.stubGlobal('fetch', fetcher);
    await startAccountFeedLink('synthetic-owner', 'bank', 'synthetic-access'); const body = JSON.parse(fetcher.mock.calls[0]?.[1]?.body ?? '{}'); expect(body.access_token).toBe('synthetic-access'); expect(body.products).toBeUndefined();
  });
  it('reads bank balances without fetching transactions or money movement', async () => {
    configure(); const fetcher = vi.fn().mockResolvedValue(Response.json({ accounts: [] })); vi.stubGlobal('fetch', fetcher);
    expect(await readAccountFeed('synthetic-access', 'bank')).toEqual({ accounts: [], holdings: [], securities: [] }); expect(fetcher.mock.calls[0]?.[0]).toBe('https://sandbox.plaid.com/accounts/balance/get'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('reads complete brokerage holdings from the holdings endpoint', async () => {
    configure(); const fetcher = vi.fn().mockResolvedValue(Response.json({ accounts: [], holdings: [], securities: [] })); vi.stubGlobal('fetch', fetcher);
    await readAccountFeed('synthetic-access', 'brokerage'); expect(fetcher.mock.calls[0]?.[0]).toBe('https://sandbox.plaid.com/investments/holdings/get');
  });
  it('classifies reconnect errors without forwarding provider messages or credentials', async () => {
    configure(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error_code: 'ITEM_LOGIN_REQUIRED', error_message: 'private detail' }, { status: 400 })));
    try { await readAccountFeed('synthetic-access', 'bank'); throw new Error('Expected failure'); } catch (e) { expect(e).toBeInstanceOf(AccountFeedError); expect((e as AccountFeedError).code).toBe('ITEM_LOGIN_REQUIRED'); expect((e as Error).message).not.toContain('private detail'); }
  });
  it('never presents sandbox accounts as live accounts', () => { configure(); expect(accountFeedConfiguration().testMode).toBe(true); });
});