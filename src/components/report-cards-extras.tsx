import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Download } from 'lucide-react';
import {
  compareReportCards, decideReportCardAccess, getFundInvestorFunnel, getMyReportCardCoverage, getReportCardAccessQueue,
  getReportCardAlerts, getReportCardDownloads, getReportCardService, getRequestableReportCards, prepareReportCardDownload,
  readGrantedReportCard, requestReportCardAccess,
} from '@/lib/report-card-insights.functions';
import { setEntitlement, requestService } from '@/lib/contracts.functions';
import { buildDownload, FORMAT_LABEL, type DownloadFormat } from '@/lib/report-card-export';
import { ACCESS_STATE_LABEL, COVERAGE_LABEL, compareCards, KIND_LABEL, REPORT_CARDS_SERVICE_KEY } from '@/lib/report-card-insights-model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';

const err = (e: unknown) => toast.error((e as Error).message);
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-US') : '');
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-base text-muted-foreground">{children}</p>;

/** Download one or more report cards as PDF, spreadsheet, Excel or data file. Every download is recorded. */
export function DownloadMenu({ cardIds, scope, compare = false, label = 'Download' }: { cardIds: string[]; scope: 'card' | 'list' | 'compare'; compare?: boolean; label?: string }) {
  const prepare = useServerFn(prepareReportCardDownload); const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async (format: DownloadFormat) => {
    setBusy(true);
    try { const r = await prepare({ data: { cardIds, format, scope } }); await buildDownload(format, r.cards, { compare }); qc.invalidateQueries({ queryKey: ['report-card-downloads'] }); }
    catch (e) { err(e); } finally { setBusy(false); }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="sm" variant="outline" disabled={busy || !cardIds.length}><Download className="mr-1 h-4 w-4" />{busy ? 'Preparing…' : label}</Button></DropdownMenuTrigger>
      <DropdownMenuContent>{(Object.keys(FORMAT_LABEL) as DownloadFormat[]).map((f) => <DropdownMenuItem key={f} onSelect={() => run(f)}>{FORMAT_LABEL[f]}</DropdownMenuItem>)}</DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Client users: which funds and clients have Report Cards, with a request for the rest. */
export function CoverageBanner() {
  const load = useServerFn(getMyReportCardCoverage); const ask = useServerFn(requestService);
  const q = useQuery({ queryKey: ['report-card-coverage'], queryFn: () => load() });
  const [asked, setAsked] = useState<Record<string, boolean>>({});
  if (!q.data || q.data.staff) return null;
  const on = [...q.data.funds.filter((f) => f.via), ...q.data.clients.filter((c) => c.via)];
  const offFunds = q.data.funds.filter((f) => !f.via && f.clientId), offClients = q.data.clients.filter((c) => !c.via);
  const request = async (key: string, clientId: string, offeringId: string | null) => {
    try { await ask({ data: { clientId, offeringId, serviceKey: REPORT_CARDS_SERVICE_KEY, note: offeringId ? 'Report Cards add-on for this fund' : 'Report Cards for our whole organization' } }); setAsked({ ...asked, [key]: true }); toast.success('Request sent to Harmonious'); } catch (e) { err(e); }
  };
  return (
    <Card><CardContent className="space-y-3 pt-5 text-base">
      {on.length ? <div className="flex flex-wrap items-center gap-2"><span>Report Cards is on for:</span>{on.map((x) => <Badge key={x.id} variant="secondary">{x.label} · {COVERAGE_LABEL[x.via!]}</Badge>)}</div> : <p>Report Cards isn't on for any of your funds yet.</p>}
      {offFunds.length || offClients.length ? <div className="space-y-2"><p className="text-sm text-muted-foreground">Add Report Cards to one fund, or to your whole organization so it covers every fund.</p>
        {offClients.map((c) => <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2"><span>{c.label} · whole organization</span><Button size="sm" disabled={asked[c.id]} onClick={() => request(c.id, c.id, null)}>{asked[c.id] ? 'Requested' : 'Request Report Cards'}</Button></div>)}
        {offFunds.map((f) => <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2"><span>{f.label} · this fund only</span><Button size="sm" variant="outline" disabled={asked[f.id]} onClick={() => request(f.id, f.clientId!, f.id)}>{asked[f.id] ? 'Requested' : 'Add to this fund'}</Button></div>)}
      </div> : null}
    </CardContent></Card>
  );
}

export function AlertsPanel() {
  const load = useServerFn(getReportCardAlerts);
  const q = useQuery({ queryKey: ['report-card-alerts'], queryFn: () => load() });
  if (q.isLoading) return <Empty>Loading…</Empty>;
  if (q.isError) return <Empty>Alerts could not be loaded.</Empty>;
  const d = q.data!;
  return (
    <div className="space-y-6">
      <section className="space-y-2"><h3 className="text-lg">Grade changes</h3>
        {d.grade.length ? d.grade.map((a: any) => <div key={a.key} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-base">
          <span className="flex items-center gap-2">{a.direction === 'up' ? <ArrowUp className="h-4 w-4 text-primary" /> : <ArrowDown className="h-4 w-4 text-destructive" />}<b>{a.subjectLabel}</b> went from {a.from} to {a.to}</span>
          <span className="text-sm text-muted-foreground">{KIND_LABEL[a.kind]} · period ending {a.periodEnd}</span></div>) : <Empty>No grade changes between published report cards.</Empty>}
      </section>
      <section className="space-y-2"><h3 className="text-lg">Figures to check</h3><p className="text-sm text-muted-foreground">Big score moves (20 points or more), changed weights, missing evidence and overlapping periods. Nothing is changed automatically.</p>
        {d.checks.length ? d.checks.map((c: any) => <Card key={c.cardId}><CardContent className="space-y-1 pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><b>{c.subjectLabel}</b><Badge variant={c.status === 'draft' ? 'outline' : 'secondary'}>{c.status === 'draft' ? 'Draft' : 'Published'} · {c.periodStart} to {c.periodEnd}</Badge></div><ul className="list-disc pl-5 text-base">{c.items.map((i: string) => <li key={i}>{i}</li>)}</ul></CardContent></Card>) : <Empty>Nothing to check right now.</Empty>}
      </section>
    </div>
  );
}

export function ComparePanel({ cards }: { cards: any[] }) {
  const load = useServerFn(compareReportCards);
  const [a, setA] = useState(''), [b, setB] = useState('');
  const options = cards.map((c) => ({ value: c.id, label: `${c.subjectLabel ?? 'Report card'} · ${c.period_start} to ${c.period_end}`, detail: `${KIND_LABEL[c.kind] ?? ''} · ${c.status}` }));
  const q = useQuery({ queryKey: ['report-card-compare', a, b], queryFn: () => load({ data: { a, b } }), enabled: Boolean(a && b && a !== b) });
  if (cards.length < 2) return <Empty>You need at least two report cards to compare.</Empty>;
  const rows = q.data ? compareCards(q.data.a as any, q.data.b as any) : [];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-base">First<SearchableSelect aria-label="First report card" placeholder="Choose a report card…" options={options} value={a} onValueChange={setA} /></label>
        <label className="space-y-1 text-base">Second<SearchableSelect aria-label="Second report card" placeholder="Choose a report card…" options={options.filter((o) => o.value !== a)} value={b} onValueChange={setB} /></label>
      </div>
      {q.isError ? <Empty>{(q.error as Error).message}</Empty> : null}
      {q.data ? <Card><CardContent className="space-y-3 pt-5">
        <div className="grid grid-cols-3 gap-2 border-b pb-3 text-base"><span className="text-muted-foreground">Overall</span><b className="text-2xl">{q.data.a.grade}</b><b className="text-2xl">{q.data.b.grade}</b></div>
        <div className="grid grid-cols-3 gap-2 text-sm text-muted-foreground"><span>Measure</span><span>{q.data.a.subject} ({q.data.a.periodEnd})</span><span>{q.data.b.subject} ({q.data.b.periodEnd})</span></div>
        {rows.map((r) => <div key={r.label} className="grid grid-cols-3 gap-2 border-b py-2 text-base"><span>{r.label}</span><span>{r.a ?? 'No score'}</span><span>{r.b ?? 'No score'}{r.diff !== null && r.diff !== 0 ? <span className={r.diff > 0 ? 'ml-2 text-primary' : 'ml-2 text-destructive'}>{r.diff > 0 ? '+' : ''}{r.diff}</span> : null}</span></div>)}
        <DownloadMenu cardIds={[a, b]} scope="compare" compare label="Download comparison" />
      </CardContent></Card> : null}
    </div>
  );
}

export function FunnelPanel({ funds }: { funds: { id: string; label: string }[] }) {
  const load = useServerFn(getFundInvestorFunnel);
  const [fund, setFund] = useState(funds[0]?.id ?? '');
  const q = useQuery({ queryKey: ['report-card-funnel', fund], queryFn: () => load({ data: { offeringId: fund } }), enabled: Boolean(fund) });
  if (!funds.length) return <Empty>No funds with Report Cards yet.</Empty>;
  return (
    <div className="space-y-4">
      <label className="block max-w-md space-y-1 text-base">Fund<SearchableSelect aria-label="Fund" placeholder="Choose a fund…" options={funds.map((f) => ({ value: f.id, label: f.label }))} value={fund} onValueChange={setFund} /></label>
      {q.isLoading ? <Empty>Loading…</Empty> : q.isError ? <Empty>{(q.error as Error).message}</Empty> : q.data ? <Card><CardContent className="space-y-3 pt-5">
        {q.data.steps.map((s: any) => <div key={s.key} className="space-y-1"><div className="flex justify-between text-base"><span>{s.label}</span><span><b>{s.count}</b> <span className="text-muted-foreground">({s.pct}%)</span></span></div><div className="h-3 rounded bg-muted"><div className="h-3 rounded bg-primary" style={{ width: `${s.pct}%` }} /></div></div>)}
        <p className="text-sm text-muted-foreground">Counts come from recorded invitations, link clicks, sign-ins, identity checks, signatures and reconciled money. {q.data.followUps ? `${q.data.followUps} investors need a follow-up.` : ''}</p>
      </CardContent></Card> : null}
    </div>
  );
}

export function AccessQueuePanel() {
  const load = useServerFn(getReportCardAccessQueue), decide = useServerFn(decideReportCardAccess); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['report-card-access-queue'], queryFn: () => load() });
  const [days, setDays] = useState<Record<string, number>>({});
  const m = useMutation({ mutationFn: (v: { requestId: string; decision: 'approved' | 'denied' | 'revoked'; days?: number }) => decide({ data: { ...v, reason: '' } }), onSuccess: () => { toast.success('Decision recorded'); qc.invalidateQueries({ queryKey: ['report-card-access-queue'] }); }, onError: err });
  if (q.isLoading) return <Empty>Loading…</Empty>;
  const rows = q.data?.rows ?? [];
  if (!rows.length) return <Empty>No one has asked to see a report card.</Empty>;
  return <div className="space-y-3">{rows.map((r: any) => <Card key={r.id}><CardContent className="space-y-2 pt-4 text-base">
    <div className="flex flex-wrap items-center justify-between gap-2"><span><b>{r.requester}</b>{r.requesterEmail ? <span className="text-sm text-muted-foreground"> · {r.requesterEmail}</span> : null} asked for <b>{r.subjectLabel}</b> ({r.periodStart} to {r.periodEnd})</span><Badge variant="outline">{ACCESS_STATE_LABEL[r.state as keyof typeof ACCESS_STATE_LABEL]}{r.state === 'active' && r.expiresAt ? ` until ${day(r.expiresAt)}` : ''}</Badge></div>
    {r.reason ? <p className="text-sm text-muted-foreground">“{r.reason}”</p> : null}
    {r.state === 'pending' ? <div className="flex flex-wrap items-center gap-2"><select aria-label="How long" className="h-10 rounded-md border bg-background px-3 text-base" value={days[r.id] ?? 14} onChange={(e) => setDays({ ...days, [r.id]: Number(e.target.value) })}>{[7, 14, 30].map((d) => <option key={d} value={d}>{d} days</option>)}</select><Button disabled={m.isPending} onClick={() => m.mutate({ requestId: r.id, decision: 'approved', days: days[r.id] ?? 14 })}>Approve</Button><Button variant="outline" disabled={m.isPending} onClick={() => m.mutate({ requestId: r.id, decision: 'denied' })}>Deny</Button></div>
      : r.state === 'active' ? <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate({ requestId: r.id, decision: 'revoked' })}>End access now</Button> : null}
    <p className="text-xs text-muted-foreground">Asked {day(r.at)}. They see the grade, summary and measure scores, never evidence files.</p>
  </CardContent></Card>)}</div>;
}

/** Published report cards a person is connected to but can't see yet. Grades stay hidden until approved. */
export function RequestableCardsPanel() {
  const load = useServerFn(getRequestableReportCards), ask = useServerFn(requestReportCardAccess), read = useServerFn(readGrantedReportCard); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['report-card-requestable'], queryFn: () => load() });
  const [reason, setReason] = useState<Record<string, string>>({}), [open, setOpen] = useState<string | null>(null), [viewing, setViewing] = useState<any>(null);
  const rows = q.data?.rows ?? [];
  if (q.isLoading || !rows.length) return null;
  return (
    <section className="space-y-3"><h2 className="text-xl">Fund report cards</h2><p className="text-base text-muted-foreground">Ask to see a fund's published report card. The fund's manager or Harmonious decides.</p>
      {rows.map((r: any) => <Card key={r.cardId}><CardContent className="space-y-2 pt-4 text-base">
        <div className="flex flex-wrap items-center justify-between gap-2"><span><b>{r.subjectLabel}</b> · {r.periodStart} to {r.periodEnd}</span>{r.state ? <Badge variant="outline">{ACCESS_STATE_LABEL[r.state as keyof typeof ACCESS_STATE_LABEL]}{r.expiresAt ? ` until ${day(r.expiresAt)}` : ''}</Badge> : null}</div>
        {r.state === 'active' ? <div className="flex flex-wrap gap-2"><Button size="sm" onClick={async () => { try { setViewing({ id: r.cardId, ...(await read({ data: { cardId: r.cardId } })) }); } catch (e) { err(e); } }}>View</Button><DownloadMenu cardIds={[r.cardId]} scope="card" /></div>
          : r.state === 'pending' ? null : open === r.cardId ? <div className="space-y-2"><Textarea aria-label="Why you need it" placeholder="Why do you need to see it?" value={reason[r.cardId] ?? ''} onChange={(e) => setReason({ ...reason, [r.cardId]: e.target.value })} /><Button size="sm" onClick={async () => { try { await ask({ data: { cardId: r.cardId, reason: reason[r.cardId] ?? '' } }); toast.success('Request sent'); setOpen(null); qc.invalidateQueries({ queryKey: ['report-card-requestable'] }); } catch (e) { err(e); } }}>Send request</Button></div>
          : <Button size="sm" variant="outline" onClick={() => setOpen(r.cardId)}>Request access</Button>}
        {viewing?.id === r.cardId ? <div className="space-y-2 border-t pt-3"><div className="flex items-end gap-3"><span className="text-4xl font-semibold">{viewing.card.grade}</span>{viewing.card.score !== null ? <span className="pb-1 text-muted-foreground">{viewing.card.score} / 100</span> : null}</div>{viewing.card.summary ? <p className="whitespace-pre-wrap">{viewing.card.summary}</p> : null}{viewing.card.metrics.map((m: any) => <div key={m.label} className="flex justify-between border-b py-1"><span>{m.label}</span><span>{m.score ?? 'No score'} / 100</span></div>)}</div> : null}
      </CardContent></Card>)}
    </section>
  );
}

export function DownloadsPanel() {
  const load = useServerFn(getReportCardDownloads);
  const q = useQuery({ queryKey: ['report-card-downloads'], queryFn: () => load() });
  if (q.isLoading) return <Empty>Loading…</Empty>;
  const rows = q.data?.rows ?? [];
  if (!rows.length) return <Empty>No downloads yet.</Empty>;
  return <div className="space-y-1">{q.data!.all ? <p className="text-sm text-muted-foreground">Everyone's Report Card downloads, newest first.</p> : <p className="text-sm text-muted-foreground">Your Report Card downloads, newest first.</p>}{rows.map((r: any) => <div key={r.id} className="flex flex-wrap justify-between gap-2 border-b py-2 text-base"><span>{r.label || `${r.count} report cards`}</span><span className="text-sm text-muted-foreground">{FORMAT_LABEL[r.format as DownloadFormat]} · {r.by} · {new Date(r.at).toLocaleString('en-US')}</span></div>)}</div>;
}

/** Staff: switch Report Cards on for a whole client (standalone) or one fund (add-on). */
export function ServicePanel() {
  const load = useServerFn(getReportCardService), save = useServerFn(setEntitlement); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['report-card-service'], queryFn: () => load() });
  const [client, setClient] = useState(''), [fund, setFund] = useState('all'), [busy, setBusy] = useState(false);
  if (q.isLoading) return <Empty>Loading…</Empty>;
  if (q.isError) return <Empty>{(q.error as Error).message}</Empty>;
  const d = q.data!;
  const set = async (clientId: string, offeringId: string | null, on: boolean) => {
    setBusy(true);
    try { await save({ data: { client_id: clientId, offering_id: offeringId, service_key: REPORT_CARDS_SERVICE_KEY, status: on ? 'included' : 'not_included', effective_date: on ? new Date().toISOString().slice(0, 10) : '', termination_date: on ? '' : new Date().toISOString().slice(0, 10), note: on ? (offeringId ? 'Report Cards fund add-on' : 'Report Cards for the whole client') : '' } }); toast.success(on ? 'Report Cards switched on' : 'Report Cards switched off'); qc.invalidateQueries({ queryKey: ['report-card-service'] }); }
    catch (e) { err(e); } finally { setBusy(false); }
  };
  const live = d.rows.filter((r) => r.status === 'included');
  return (
    <div className="space-y-5">
      <Card><CardHeader><CardTitle className="text-base">Switch on Report Cards</CardTitle></CardHeader><CardContent className="space-y-3">
        <p className="text-base text-muted-foreground">Whole client: on its own, covering the client and every one of its funds. One fund: an add-on for that fund only. Pricing follows the client's quote or statement of work.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-base">Client<SearchableSelect aria-label="Client" placeholder="Choose a client…" options={d.clients.map((c) => ({ value: c.id, label: c.name }))} value={client} onValueChange={(v) => { setClient(v); setFund('all'); }} /></label>
          <label className="space-y-1 text-base">Covers<SearchableSelect aria-label="Covers" placeholder="Whole client" options={[{ value: 'all', label: 'Whole client (standalone)' }, ...d.funds.filter((f) => f.clientId === client).map((f) => ({ value: f.id, label: `${f.name} only (fund add-on)` }))]} value={fund} onValueChange={setFund} disabled={!client} /></label>
        </div>
        <Button disabled={!client || busy} onClick={() => set(client, fund === 'all' ? null : fund, true)}>Switch on</Button>
      </CardContent></Card>
      <section className="space-y-2"><h3 className="text-lg">Where it's on</h3>
        {live.length ? live.map((r) => <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-base"><span><b>{r.clientName}</b>{r.fundName ? ` · ${r.fundName}` : ''} <Badge variant="secondary" className="ml-1">{COVERAGE_LABEL[r.scope as 'standalone' | 'fund_add_on']}</Badge>{r.effectiveDate ? <span className="ml-2 text-sm text-muted-foreground">since {r.effectiveDate}</span> : null}</span><Button size="sm" variant="outline" disabled={busy} onClick={() => set(r.clientId, r.offeringId, false)}>Switch off</Button></div>) : <Empty>Report Cards isn't on for any client or fund yet.</Empty>}
      </section>
    </div>
  );
}

