import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { usePlaidLink } from 'react-plaid-link';
import { Banknote, Landmark, RefreshCw, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { ACCOUNT_FEED_CONSENT_VERSION, feedTotals, type AccountFeedKind } from '@/lib/account-aggregation';
import { getPersonalAccountFeeds, startPersonalAccountFeed, finishPersonalAccountFeed, refreshPersonalAccountFeed, disconnectPersonalAccountFeed } from '@/lib/account-aggregation.functions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

const money = (cents: number | null, currency: string | null) => cents === null || !currency ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
export function PersonalAccountFeeds() {
  const load = useServerFn(getPersonalAccountFeeds), start = useServerFn(startPersonalAccountFeed), finish = useServerFn(finishPersonalAccountFeed), refresh = useServerFn(refreshPersonalAccountFeed), disconnect = useServerFn(disconnectPersonalAccountFeed);
  const qc = useQueryClient();
  const { data, isPending, error } = useQuery({ queryKey: ['personal-account-feeds'], queryFn: () => load() });
  const [consent, setConsent] = useState<{ kind: AccountFeedKind; connectionId?: string } | null>(null);
  const [checked, setChecked] = useState(false), [busy, setBusy] = useState(false), [unlink, setUnlink] = useState<string | null>(null);
  const [pending, setPending] = useState<{ linkToken: string; consentId: string } | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['personal-account-feeds'] });
  const onSuccess = useCallback(async (publicToken: string | null) => {
    if (!pending) return;
    setBusy(true);
    try {
      const result = await finish({ data: { publicToken, consentId: pending.consentId } });
      if (result.ok) toast.success('Account connected and portfolio updated');
      else toast.error(result.message ?? 'Your connection was saved; account information is not available yet.');
      await invalidate();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Account connection could not be completed.'); }
    finally { setPending(null); localStorage.removeItem('plaid-oauth'); setBusy(false); }
  }, [pending, finish, qc]);
  const { open, ready } = usePlaidLink({ token: pending?.linkToken ?? null, onSuccess, onExit: () => { setPending(null); localStorage.removeItem('plaid-oauth'); } });
  useEffect(() => { if (pending && ready) open(); }, [pending, ready, open]);
  const begin = async () => {
    if (!consent || !checked) return;
    setBusy(true);
    try {
      const r = await start({ data: { ...consent, consent: true, consentVersion: ACCOUNT_FEED_CONSENT_VERSION } });
      localStorage.setItem('plaid-oauth', JSON.stringify({ ...r, kind: 'personal', back: '/wealth', createdAt: Date.now() }));
      setPending(r); setConsent(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Account connection could not be started.'); }
    finally { setBusy(false); }
  };
  const runRefresh = async (connectionId: string) => {
    setBusy(true);
    try { const r = await refresh({ data: { connectionId } }); r.ok ? toast.success('Account snapshot updated') : toast.error(r.message ?? 'Account update unavailable'); await invalidate(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Account update failed.'); }
    finally { setBusy(false); }
  };
  return <section className="space-y-5 border-b py-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl">Connected accounts</h2><div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={!data?.configured || busy} onClick={() => { setChecked(false); setConsent({ kind: 'bank' }); }}><Banknote className="mr-2 size-4"/>Connect bank</Button>
      <Button variant="outline" disabled={!data?.configured || busy} onClick={() => { setChecked(false); setConsent({ kind: 'brokerage' }); }}><Landmark className="mr-2 size-4"/>Connect brokerage</Button>
    </div></div>
    {isPending ? <p>Loading connected accounts…</p> : error ? <p role="alert" className="text-destructive">{error.message}</p> : null}
    {data && !data.configured ? <p className="text-muted-foreground">Account feeds are awaiting connection setup.</p> : null}
    {data?.testMode ? <Badge variant="outline">Test connections only · live feeds not enabled</Badge> : null}
    {data && !data.connections.some(c => c.status !== 'disconnected') ? <p className="text-sm text-muted-foreground">No bank or brokerage accounts connected.</p> : null}
    {data?.snapshots.length ? <div className="flex flex-wrap gap-8 border-y py-4">{feedTotals(data.snapshots).map(t => <div key={t.currency}><p className="text-sm text-muted-foreground">Connected account value · {t.currency}</p><p className="text-2xl">{money(t.valueCents, t.currency)}</p></div>)}</div> : null}
    {data?.connections.filter(c => c.status !== 'disconnected').map(c => <div key={c.id} className="space-y-3 border-b pb-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-medium">{c.institution_name ?? (c.feed_kind === 'bank' ? 'Bank connection' : 'Brokerage connection')}</h3><p className="text-xs text-muted-foreground">{c.last_synced_at ? `Last retrieved ${new Date(c.last_synced_at).toLocaleString('en-US')}` : 'Awaiting first account snapshot'}</p></div>
        <div className="flex flex-wrap gap-2"><Badge variant="outline">{c.status === 'needs_reconnect' ? 'Reconnect required' : 'Connected'}</Badge>{c.status === 'needs_reconnect' ? <Button size="sm" disabled={busy} onClick={() => { setChecked(false); setConsent({ kind: c.feed_kind as AccountFeedKind, connectionId: c.id }); }}>Reconnect</Button> : <Button size="icon" variant="outline" title="Refresh accounts" aria-label="Refresh accounts" disabled={busy} onClick={() => void runRefresh(c.id)}><RefreshCw className="size-4"/></Button>}<Button size="icon" variant="ghost" title="Disconnect accounts" aria-label="Disconnect accounts" disabled={busy} onClick={() => setUnlink(c.id)}><Unplug className="size-4"/></Button></div></div>
      {data.snapshots.filter(a => a.connection_id === c.id).map(a => <div key={a.provider_account_id} className="space-y-2">
        <div className="flex flex-wrap justify-between gap-2 text-sm"><span className="font-medium">{a.account_name}{a.account_mask ? ` · ••••${a.account_mask}` : ''}</span><span>{money(a.current_balance_cents, a.currency)}</span></div>
        <p className="text-xs text-muted-foreground">{a.account_subtype ?? a.account_type} · {a.currency}{a.provider_as_of ? ` · Institution updated ${new Date(a.provider_as_of).toLocaleString('en-US')}` : ' · Institution update time unavailable'}</p>
        {a.account_type === 'depository' ? <p className="text-xs text-muted-foreground">Available balance: {money(a.available_balance_cents, a.currency)}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-left text-sm"><thead className="text-muted-foreground"><tr><th className="py-2">Security</th><th>Quantity</th><th>Cost</th><th>Value</th><th>Price date</th></tr></thead><tbody>{a.holdings.map((h, i) => <tr key={`${h.securityId}-${i}`} className="border-t"><td className="py-2">{h.name}{h.ticker ? ` (${h.ticker})` : ''}</td><td>{h.quantity ?? 'Unavailable'}</td><td>{money(h.costCents, h.currency)}</td><td>{money(h.valueCents, h.currency)}</td><td>{h.priceAsOf ?? 'Unavailable'}</td></tr>)}</tbody></table>{!a.holdings.length ? <p className="text-sm text-muted-foreground">No security positions reported.</p> : null}</div>}
      </div>)}
    </div>)}
    <Dialog open={Boolean(consent)} onOpenChange={v => { if (!v) setConsent(null); }}><DialogContent><DialogHeader><DialogTitle>Connect your {consent?.kind === 'brokerage' ? 'brokerage' : 'bank'} accounts</DialogTitle><DialogDescription>Authorize Harmonious to receive account names, masked account numbers, balances{consent?.kind === 'brokerage' ? ', securities and holdings' : ' and read-only account activity access'}. Your login credentials stay with the secure account connection service.</DialogDescription></DialogHeader>
      <p className="text-sm">This access cannot transfer money, place trades or change your fund records. You can disconnect at any time; prior snapshots remain in your private history.</p>
      <label className="flex items-start gap-3 text-sm"><Checkbox checked={checked} onCheckedChange={v => setChecked(v === true)} aria-label="I authorize read-only account access"/><span>I authorize read-only access to my accounts under the <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary underline">Harmonious Privacy Policy</a>.</span></label>
      <DialogFooter><Button variant="outline" onClick={() => setConsent(null)}>Cancel</Button><Button disabled={!checked || busy} onClick={() => void begin()}>Agree & connect</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={Boolean(unlink)} onOpenChange={v => { if (!v) setUnlink(null); }}><DialogContent><DialogHeader><DialogTitle>Disconnect accounts?</DialogTitle><DialogDescription>Future updates stop and these accounts leave your current portfolio. Previously retrieved snapshots remain in your private history.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setUnlink(null)}>Cancel</Button><Button disabled={busy} onClick={async () => { if (!unlink) return; setBusy(true); try { await disconnect({ data: { connectionId: unlink } }); setUnlink(null); await invalidate(); toast.success('Accounts disconnected'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not disconnect accounts.'); } finally { setBusy(false); } }}>Disconnect</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}