import { decryptConnectionKey, encryptConnectionKey } from './connection-key-crypto.server';
import { feedOwnerAllowed, normalizeAccountFeed, type AccountFeedKind } from './account-aggregation';
import { AccountFeedError, readAccountFeed } from './account-aggregation-provider.server';

export async function ownedFeedConnection(ownerId: string, id: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const r = await supabaseAdmin.from('personal_account_connections').select('*').eq('id', id).eq('owner_user_id', ownerId).maybeSingle();
  if (r.error || !r.data || !feedOwnerAllowed(ownerId, r.data.owner_user_id) || r.data.status === 'disconnected') throw new Error('Account connection not found.');
  return r.data;
}
export async function appendFeedEvent(ownerId: string, connectionId: string | null, action: 'consented' | 'connected' | 'refreshed' | 'refresh_failed' | 'reconnect_required' | 'disconnected', detail: Record<string, string | number> = {}) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const r = await supabaseAdmin.from('personal_account_connection_events').insert({ owner_user_id: ownerId, connection_id: connectionId, action, detail }).select('id').single();
  if (r.error) throw new Error('Account connection history could not be recorded.');
  return r.data.id;
}
export async function refreshOwnedAccountFeed(ownerId: string, connectionId: string) {
  const connection = await ownedFeedConnection(ownerId, connectionId);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  try {
    const result = await readAccountFeed(decryptConnectionKey(connection.access_token_ciphertext), connection.feed_kind as AccountFeedKind);
    const observedAt = new Date().toISOString();
    const normalized = normalizeAccountFeed(ownerId, connectionId, connection.feed_kind as AccountFeedKind, result.accounts, result.holdings, result.securities, observedAt);
    if (normalized.snapshots.length) {
      const inserted = await supabaseAdmin.from('personal_account_snapshots').insert(normalized.snapshots);
      if (inserted.error) throw new Error('Account snapshot could not be saved.');
    }
    const saved = await supabaseAdmin.from('personal_account_connections').update({ last_synced_at: observedAt, updated_at: observedAt, status: 'connected' }).eq('id', connectionId).eq('owner_user_id', ownerId).neq('status', 'disconnected');
    if (saved.error) throw new Error('Account refresh could not be recorded.');
    await appendFeedEvent(ownerId, connectionId, 'refreshed', { accounts: normalized.snapshots.length, omitted: normalized.omitted });
    return { ok: true, omitted: normalized.omitted, accounts: normalized.snapshots.length };
  } catch (error) {
    const reconnect = error instanceof AccountFeedError && ['ITEM_LOGIN_REQUIRED', 'ITEM_ACCESS_NOT_GRANTED', 'ACCESS_NOT_GRANTED', 'INVALID_ACCESS_TOKEN'].includes(error.code);
    if (reconnect) await supabaseAdmin.from('personal_account_connections').update({ status: 'needs_reconnect', updated_at: new Date().toISOString() }).eq('id', connectionId).eq('owner_user_id', ownerId).neq('status', 'disconnected');
    await appendFeedEvent(ownerId, connectionId, reconnect ? 'reconnect_required' : 'refresh_failed');
    return { ok: false, reconnectRequired: reconnect, message: reconnect ? 'Renew your account connection to update these records.' : 'Account information could not be updated. Your previous snapshot is retained.' };
  }
}
export { decryptConnectionKey, encryptConnectionKey };

// Called only after the existing webhook receiver verifies the signature.
export async function processPersonalAccountFeedWebhook(itemId: string, type: string, code: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const r = await supabaseAdmin.from('personal_account_connections').select('id,owner_user_id,status').eq('provider_item_id', itemId).maybeSingle();
  if (r.error) throw new Error('Account connection lookup failed.');
  if (!r.data) return null;
  if (r.data.status === 'disconnected') return { status: 'ignored' as const, detail: 'Personal connection is disconnected.' };
  if (type === 'ITEM' && ['ERROR', 'PENDING_EXPIRATION', 'USER_PERMISSION_REVOKED'].includes(code)) {
    await supabaseAdmin.from('personal_account_connections').update({ status: 'needs_reconnect' }).eq('id', r.data.id);
    await appendFeedEvent(r.data.owner_user_id, r.data.id, 'reconnect_required');
    return { status: 'processed' as const, detail: 'Personal connection requires renewed consent.' };
  }
  if (!['HOLDINGS', 'TRANSACTIONS'].includes(type)) return { status: 'ignored' as const, detail: 'No personal feed refresh required.' };
  if (r.data.status === 'needs_reconnect') return { status: 'ignored' as const, detail: 'Personal connection requires renewed consent.' };
  const result = await refreshOwnedAccountFeed(r.data.owner_user_id, r.data.id);
  return { status: result.ok ? 'processed' as const : 'error' as const, detail: result.ok ? 'Personal account snapshot refreshed.' : 'Personal account refresh requires attention.' };
}