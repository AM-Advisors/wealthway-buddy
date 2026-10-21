import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from './require-auth';
import { ACCOUNT_FEED_CONSENT_VERSION, latestFeedSnapshots, type AccountSnapshot } from './account-aggregation';

export const getPersonalAccountFeeds = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { accountFeedConfiguration } = await import('./account-aggregation-provider.server');
  const [connections, snapshots] = await Promise.all([
    supabaseAdmin.from('personal_account_connections').select('id,feed_kind,institution_name,status,last_synced_at,created_at').eq('owner_user_id', context.userId).order('created_at', { ascending: false }),
    context.supabase.from('personal_account_snapshots').select('*').eq('owner_user_id', context.userId).order('observed_at', { ascending: false }).limit(2000),
  ]);
  if (connections.error || snapshots.error) throw new Error('Your account feeds could not be loaded.');
  const history = (snapshots.data ?? []) as unknown as AccountSnapshot[];
  return { ...accountFeedConfiguration(), connections: connections.data ?? [], snapshots: latestFeedSnapshots(history, context.userId, new Date().toISOString(), connections.data ?? []), history };
});
export const startPersonalAccountFeed = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: z.enum(['bank', 'brokerage']), consent: z.literal(true), consentVersion: z.literal(ACCOUNT_FEED_CONSENT_VERSION), connectionId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const { startAccountFeedLink, accountFeedConfiguration } = await import('./account-aggregation-provider.server');
    if (!accountFeedConfiguration().configured) throw new Error('Account connections are not configured yet.');
    const { ownedFeedConnection, decryptConnectionKey, appendFeedEvent } = await import('./account-aggregation.server');
    const connection = data.connectionId ? await ownedFeedConnection(context.userId, data.connectionId) : null;
    if (connection && connection.feed_kind !== data.kind) throw new Error('The account type does not match this connection.');
    const consentId = await appendFeedEvent(context.userId, connection?.id ?? null, 'consented', { kind: data.kind, version: data.consentVersion });
    const result = await startAccountFeedLink(context.userId, data.kind, connection ? decryptConnectionKey(connection.access_token_ciphertext) : undefined);
    return { linkToken: result.link_token, consentId };
  });
export const finishPersonalAccountFeed = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ publicToken: z.string().min(10).max(1000).nullable(), consentId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const consent = await supabaseAdmin.from('personal_account_connection_events').select('*').eq('id', data.consentId).eq('owner_user_id', context.userId).eq('action', 'consented').gte('created_at', new Date(Date.now() - 30 * 60_000).toISOString()).maybeSingle();
    if (consent.error || !consent.data) throw new Error('Your account consent expired. Please connect again.');
    const detail = consent.data.detail as { kind?: string; version?: string };
    if (!['bank', 'brokerage'].includes(detail.kind ?? '') || detail.version !== ACCOUNT_FEED_CONSENT_VERSION) throw new Error('Please confirm the current account consent.');
    const { ownedFeedConnection, encryptConnectionKey, appendFeedEvent, refreshOwnedAccountFeed } = await import('./account-aggregation.server');
    let connectionId = consent.data.connection_id;
    if (connectionId) await ownedFeedConnection(context.userId, connectionId);
    else {
      if (!data.publicToken) throw new Error('The account sign-in did not complete.');
      const provider = await import('./account-aggregation-provider.server');
      const exchanged = await provider.exchangeAccountFeedToken(data.publicToken);
      try {
        const item = await provider.readAccountFeedItem(exchanged.access_token);
        if (item.item.item_id !== exchanged.item_id) throw new Error('Account connection could not be confirmed.');
        const inserted = await supabaseAdmin.from('personal_account_connections').insert({ owner_user_id: context.userId, feed_kind: detail.kind, provider_item_id: exchanged.item_id, access_token_ciphertext: encryptConnectionKey(exchanged.access_token), consent_version: ACCOUNT_FEED_CONSENT_VERSION }).select('id').single();
        if (inserted.error) throw new Error('This account connection already exists or could not be saved.');
        connectionId = inserted.data.id;
      } catch (e) { await provider.revokeAccountFeed(exchanged.access_token).catch(() => null); throw e; }
    }
    await appendFeedEvent(context.userId, connectionId, 'connected', { consentId: data.consentId });
    return refreshOwnedAccountFeed(context.userId, connectionId);
  });
export const refreshPersonalAccountFeed = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ connectionId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => (await import('./account-aggregation.server')).refreshOwnedAccountFeed(context.userId, data.connectionId));
export const disconnectPersonalAccountFeed = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ connectionId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const helper = await import('./account-aggregation.server');
    const c = await helper.ownedFeedConnection(context.userId, data.connectionId);
    await (await import('./account-aggregation-provider.server')).revokeAccountFeed(helper.decryptConnectionKey(c.access_token_ciphertext));
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const r = await supabaseAdmin.from('personal_account_connections').update({ status: 'disconnected', access_token_ciphertext: '', disconnected_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', c.id).eq('owner_user_id', context.userId);
    if (r.error) throw new Error('Connection revocation succeeded, but its local status could not be saved. Please retry.');
    await helper.appendFeedEvent(context.userId, c.id, 'disconnected');
    return { ok: true };
  });