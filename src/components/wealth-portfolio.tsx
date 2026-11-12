import { Suspense, useState } from 'react';
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Plus, Pencil, Upload, AlertTriangle, Info } from 'lucide-react';
import { getWealthPortfolioView, listWealthPortfolioSubjects, getWealthAuditTrail } from '@/lib/wealth-portfolio.functions';
import { SOURCE_LABELS, ASSET_CLASS_LABELS, ENTITY_TYPE_LABELS, SELF, quarterOf, type PortfolioView, type DataSource } from '@/lib/wealth-portfolio-model';
import { HoldingDialog, EntityDialog, OwnershipDialog, CommitmentDialog, CashFlowDialog, ImportDialog, type HoldingEdit } from '@/components/wealth-portfolio-forms';
import { WealthReportsPanel } from '@/components/wealth-portfolio-reports';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const today = () => new Date().toISOString().slice(0, 10);
const money = (c: number | null | undefined, currency = 'USD') => c === null || c === undefined ? 'Not recorded' : new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(c / 100);
const pct = (bps: number | null | undefined) => bps === null || bps === undefined ? '' : `${(bps / 100).toFixed(2)}%`;
const multiple = (m: number | null) => m === null ? 'n/a' : `${m.toFixed(2)}x`;
const SOURCE_STYLE: Record<DataSource, 'default' | 'secondary' | 'outline'> = { fund_records: 'default', manual: 'outline', import: 'secondary', connected: 'secondary' };
export const wealthPortfolioKey = (ownerId: string | undefined, asOf: string, start: string) => ['wealth-portfolio', ownerId ?? 'me', asOf, start] as const;

function SourceBadge({ source }: { source: DataSource }) { return <Badge variant={SOURCE_STYLE[source]} className="whitespace-nowrap">{SOURCE_LABELS[source]}</Badge>; }
function Stat({ label, value, note }: { label: string; value: string; note?: string }) { return <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p>{note ? <p className="mt-1 text-sm text-muted-foreground">{note}</p> : null}</div>; }
function Empty({ children }: { children: React.ReactNode }) { return <p className="rounded-md border border-dashed p-6 text-base text-muted-foreground">{children}</p>; }

/** Consolidated portfolio: owner edits; delegates and Harmonious staff with reporting permission read only. */
export function WealthPortfolio() {
  const subjectsFn = useServerFn(listWealthPortfolioSubjects);
  const { data: subjects } = useSuspenseQuery({ queryKey: ['wealth-portfolio-subjects'], queryFn: () => subjectsFn() });
  const [owner, setOwner] = useState<string>(subjects.subjects[0]!.ownerId);
  const [asOf, setAsOf] = useState(today());
  const [start, setStart] = useState(quarterOf(today()).start);
  const subject = subjects.subjects.find(s => s.ownerId === owner) ?? subjects.subjects[0]!;
  return <div className="space-y-6 text-base">
    <div className="flex flex-wrap items-end gap-4">
      {subjects.subjects.length > 1 ? <div className="space-y-1.5"><Label className="text-base">Portfolio</Label><Select value={owner} onValueChange={setOwner}><SelectTrigger className="w-72"><SelectValue /></SelectTrigger><SelectContent>{subjects.subjects.map(s => <SelectItem key={s.ownerId} value={s.ownerId}>{s.label}{s.role === 'delegate' ? ' · shared with you' : s.role === 'staff' ? ' · staff view' : ''}</SelectItem>)}</SelectContent></Select></div> : null}
      <div className="space-y-1.5"><Label htmlFor="pf-asof" className="text-base">Values as of</Label><Input id="pf-asof" type="date" max={today()} value={asOf} onChange={e => e.target.value && setAsOf(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="pf-start" className="text-base">Activity from</Label><Input id="pf-start" type="date" max={asOf} value={start} onChange={e => e.target.value && setStart(e.target.value)} /></div>
    </div>
    <Suspense fallback={<p className="py-10 text-muted-foreground">Loading portfolio…</p>}>
      <PortfolioBody ownerUserId={subject.role === 'owner' ? undefined : subject.ownerId} ownerLabel={subject.label} asOf={asOf} start={start} />
    </Suspense>
  </div>;
}

function PortfolioBody({ ownerUserId, ownerLabel, asOf, start }: { ownerUserId?: string | undefined; ownerLabel: string; asOf: string; start: string }) {
  const load = useServerFn(getWealthPortfolioView), qc = useQueryClient();
  const { data } = useSuspenseQuery({ queryKey: wealthPortfolioKey(ownerUserId, asOf, start), queryFn: () => load({ data: { ...(ownerUserId ? { ownerUserId } : {}), asOf, periodStart: start } }) });
  const v = data.view, canEdit = data.access.canEdit;
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['wealth-portfolio'] }), qc.invalidateQueries({ queryKey: ['wealth-services'] }), qc.invalidateQueries({ queryKey: ['wealth-audit'] })]); };
  const [dialog, setDialog] = useState<null | 'holding' | 'entity' | 'link' | 'commitment' | 'flow' | 'import'>(null);
  const [holdingEdit, setHoldingEdit] = useState<HoldingEdit | null>(null);
  const [entityEdit, setEntityEdit] = useState<PortfolioView['entities'][number] | null>(null);
  const [linkEdit, setLinkEdit] = useState<PortfolioView['links'][number] | null>(null);
  const [commitmentEdit, setCommitmentEdit] = useState<PortfolioView['commitments'][number] | null>(null);
  const warnings = v.issues.filter(i => i.severity === 'warning');
  const nameOf = (id: string) => id === SELF ? 'You' : v.entities.find(e => e.recordId === id)?.name ?? 'Removed entity';
  const close = (o: boolean) => { if (!o) setDialog(null); };

  return <div className="space-y-6">
    {!canEdit ? <p className="flex items-center gap-2 rounded-md border bg-muted/40 p-3"><Info className="size-4" />You are viewing {ownerLabel}'s portfolio. Only the owner can change it.</p> : null}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {v.totals.length ? v.totals.map(t => <Stat key={t.currency} label={`Total value · ${t.currency}`} value={money(t.valueCents, t.currency)} note={t.missingValues ? `${t.missingValues} holding(s) without a value` : `${t.lines} holding(s), your share`} />) : <Stat label="Total value" value="Nothing recorded" />}
      <Stat label="Things to check" value={String(warnings.length)} note={warnings.length ? 'See Data quality' : 'All values dated and current'} />
    </div>
    {v.completeness && (!v.completeness.complete || v.completeness.stale.length) ? <div role="status" className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
      <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4 shrink-0 text-destructive" />{v.completeness.complete ? 'Totals include old values' : 'Totals are incomplete'}</p>
      <p className="mt-1 text-muted-foreground">{v.completeness.message}</p>
      {v.completeness.excluded.length || v.completeness.notCounted.length || v.completeness.withoutValue.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {v.completeness.excluded.map(e => <li key={`x:${e.name}`}>{e.name}: {e.reason}</li>)}
        {v.completeness.notCounted.map(e => <li key={`n:${e.name}`}>{e.name}: {e.reason}</li>)}
        {v.completeness.withoutValue.map(n => <li key={`v:${n}`}>{n}: {v.funds.some(f => f.fundName === n && !f.valueDate) ? "no value yet, the fund hasn't published your first quarter-end statement" : 'no value recorded'}</li>)}
      </ul> : null}
    </div> : null}
    {canEdit ? <div className="flex flex-wrap gap-2"><Button size="lg" onClick={() => { setHoldingEdit(null); setDialog('holding'); }}><Plus className="mr-2 size-4" />Add holding</Button><Button size="lg" variant="outline" onClick={() => setDialog('import')}><Upload className="mr-2 size-4" />Import spreadsheet</Button></div> : null}
    <p className="text-sm text-muted-foreground">Values are added up only within the same currency. Fund values come from the fund's published statements. {v.connectedLive ? '' : 'Linked bank and brokerage accounts are not included yet.'}</p>

    <Tabs defaultValue="holdings">
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="holdings">Holdings</TabsTrigger><TabsTrigger value="ownership">Ownership</TabsTrigger><TabsTrigger value="private">Private investments</TabsTrigger><TabsTrigger value="performance">Returns</TabsTrigger><TabsTrigger value="allocation">Allocation & cash needs</TabsTrigger><TabsTrigger value="cash">Cash activity</TabsTrigger><TabsTrigger value="reports">Reports</TabsTrigger><TabsTrigger value="quality">Data quality{warnings.length ? ` (${warnings.length})` : ''}</TabsTrigger>
      </TabsList>

      <TabsContent value="holdings" className="pt-4">
        {!v.lines.length ? <Empty>No holdings yet. {canEdit ? 'Add one or import a spreadsheet.' : ''}</Empty> :
          <div className="overflow-x-auto"><table className="w-full text-left"><thead className="text-sm text-muted-foreground"><tr><th className="py-3 pr-3">Holding</th><th className="pr-3">Held by</th><th className="pr-3">Type</th><th className="pr-3 text-right">Your share</th><th className="pr-3">Value date</th><th className="pr-3">Source</th><th /></tr></thead>
            <tbody>{v.lines.map(l => <tr key={l.key} className={`border-t ${l.counted ? '' : 'text-muted-foreground'}`}>
              <td className="py-3 pr-3 font-medium">{l.name}{!l.counted ? <p className="text-sm font-normal">Not counted: {l.excludedReason}</p> : null}</td>
              <td className="pr-3">{l.holder}{l.sharePct < 1 && l.counted ? <span className="block text-sm text-muted-foreground">{(l.sharePct * 100).toFixed(1)}% of {money(l.grossValueCents, l.currency)}</span> : null}</td>
              <td className="pr-3">{ASSET_CLASS_LABELS[l.assetClass] ?? l.assetClass}</td>
              <td className="pr-3 text-right tabular-nums">{!l.counted ? 'Not counted' : l.valueCents === null && l.positionId ? <>Awaiting first statement{(() => { const f = v.funds.find(x => x.positionId === l.positionId); return f && f.contributedCents > 0 ? <span className="block text-sm text-muted-foreground">Contributed {money(f.contributedCents, l.currency)}, not counted in totals</span> : null; })()}</> : money(l.valueCents, l.currency)}</td>
              <td className="pr-3">{l.valueDate ?? 'No date'}</td>
              <td className="pr-3"><SourceBadge source={l.source} /></td>
              <td>{canEdit && l.observationId ? <Button size="icon" variant="ghost" aria-label={`Update ${l.name}`} onClick={() => { setHoldingEdit({ observationId: l.observationId!, name: l.name, assetClass: l.assetClass, currency: l.currency, valueCents: l.grossValueCents, costCents: l.costCents, sector: l.sector, geography: l.geography, holderEntityId: l.holderEntityId, representsEntityId: l.representsEntityId }); setDialog('holding'); }}><Pencil className="size-4" /></Button> : null}</td>
            </tr>)}</tbody></table></div>}
      </TabsContent>

      <TabsContent value="ownership" className="space-y-5 pt-4">
        <p className="text-muted-foreground">Add trusts, companies and accounts, then who owns what share. Holdings and fund investments held by an entity count at your share.</p>
        {canEdit ? <div className="flex flex-wrap gap-2"><Button onClick={() => { setEntityEdit(null); setDialog('entity'); }}><Plus className="mr-2 size-4" />Add entity</Button><Button variant="outline" disabled={!v.entities.length} onClick={() => { setLinkEdit(null); setDialog('link'); }}><Plus className="mr-2 size-4" />Add ownership</Button></div> : null}
        {!v.entities.length ? <Empty>No entities yet. Everything is counted as held by you directly.</Empty> :
          <ul className="divide-y rounded-md border">{v.entities.map(e => <li key={e.recordId} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div><p className="font-medium">{e.name} <span className="text-muted-foreground">· {ENTITY_TYPE_LABELS[e.entityType]}</span></p><p className="text-sm text-muted-foreground">Your share: {(e.sharePct * 100).toFixed(1)}%{e.investmentProfileId ? ' · linked to a fund investing party' : ''}</p>
              <ul className="mt-1 text-sm">{v.links.filter(l => l.childId === e.recordId).map(l => <li key={l.recordId} className="flex items-center gap-2">Owned by {nameOf(l.parentId)}: {l.pctBps === null ? 'share not entered' : `${l.pctBps / 100}%`}{canEdit ? <Button size="sm" variant="ghost" onClick={() => { setLinkEdit(l); setDialog('link'); }}>Change</Button> : null}</li>)}</ul></div>
            {canEdit ? <Button variant="ghost" size="icon" aria-label={`Update ${e.name}`} onClick={() => { setEntityEdit(e); setDialog('entity'); }}><Pencil className="size-4" /></Button> : null}
          </li>)}</ul>}
      </TabsContent>

      <TabsContent value="private" className="space-y-6 pt-4">
        <section className="space-y-3"><h3 className="text-xl font-semibold">Funds on this platform</h3>
          {!v.funds.length ? <Empty>No fund investments on this platform.</Empty> :
            <div className="overflow-x-auto"><table className="w-full text-left"><thead className="text-sm text-muted-foreground"><tr><th className="py-3 pr-3">Fund</th><th className="pr-3 text-right">Commitment</th><th className="pr-3 text-right">Paid in</th><th className="pr-3 text-right">Received</th><th className="pr-3 text-right">Still to pay</th><th className="pr-3 text-right">Latest value</th></tr></thead>
              <tbody>{v.funds.map(f => <tr key={f.positionId} className="border-t"><td className="py-3 pr-3 font-medium">{f.fundName}{f.profileLabel ? <span className="block text-sm text-muted-foreground">{f.profileLabel}</span> : null}</td><td className="pr-3 text-right">{money(f.commitmentCents)}</td><td className="pr-3 text-right">{money(f.contributedCents)}</td><td className="pr-3 text-right">{money(f.distributionsCents)}</td><td className="pr-3 text-right">{money(f.unfundedCents)}</td><td className="pr-3 text-right">{f.valueCents === null ? 'No statement yet' : <>{money(f.valueCents)}<span className="block text-sm text-muted-foreground">{f.valueDate}</span></>}</td></tr>)}</tbody></table></div>}
        </section>
        <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xl font-semibold">Outside private investments</h3>{canEdit ? <div className="flex gap-2"><Button onClick={() => { setCommitmentEdit(null); setDialog('commitment'); }}><Plus className="mr-2 size-4" />Add investment</Button><Button variant="outline" disabled={!v.commitments.length} onClick={() => setDialog('flow')}><Plus className="mr-2 size-4" />Record cash flow</Button></div> : null}</div>
          {!v.commitments.length ? <Empty>None recorded.</Empty> : v.commitments.map(c => <div key={c.recordId} className="rounded-md border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{c.name} <span className="text-muted-foreground">· held by {c.holderEntityId ? nameOf(c.holderEntityId) : 'you'}</span></p>{canEdit ? <Button size="icon" variant="ghost" aria-label={`Update ${c.name}`} onClick={() => { setCommitmentEdit(c); setDialog('commitment'); }}><Pencil className="size-4" /></Button> : null}</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-4"><span>Commitment {money(c.commitmentCents, c.currency)}</span><span>Paid in {money(c.paidInCents, c.currency)}</span><span>Received {money(c.distributionsCents, c.currency)}</span><span>Still to pay {money(c.unfundedCents, c.currency)}</span></div>
            {c.flows.length ? <ul className="mt-3 space-y-1 text-sm">{c.flows.slice().sort((a, b) => b.date.localeCompare(a.date)).map(f => <li key={f.recordId}>{f.date} · {f.flowType === 'contribution' ? 'Paid in' : 'Received'} {money(f.amountCents, c.currency)} {f.status === 'projected' ? <Badge variant="outline">Projected</Badge> : null} <SourceBadge source={f.source} />{f.note ? ` · ${f.note}` : ''}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No cash flows recorded.</p>}
          </div>)}
        </section>
      </TabsContent>

      <TabsContent value="performance" className="space-y-5 pt-4">
        {v.combined.map(c => <Stat key={c.currency} label={`All private investments · ${c.currency} · since first cash flow (XIRR)`} value={c.irr.status === 'solved' ? pct(c.irr.bps) : 'Not calculated'} note={c.irr.status === 'solved' ? `${c.investments} investment(s)` : c.irr.detail} />)}
        {!v.performance.length ? <Empty>Returns appear once private investments have dated cash flows and a value.</Empty> :
          <div className="overflow-x-auto"><table className="w-full text-left"><thead className="text-sm text-muted-foreground"><tr><th className="py-3 pr-3">Investment</th><th className="pr-3">Period</th><th className="pr-3 text-right">XIRR</th><th className="pr-3 text-right">TVPI</th><th className="pr-3 text-right">DPI</th><th className="pr-3 text-right">RVPI</th><th className="pr-3 text-right">Time-weighted</th></tr></thead>
            <tbody>{v.performance.map(p => <tr key={p.key} className="border-t align-top"><td className="py-3 pr-3 font-medium">{p.name} <span className="font-normal text-muted-foreground">· {p.currency}</span>{p.warnings.map(w => <p key={w} className="text-sm font-normal text-muted-foreground">{w}</p>)}</td><td className="pr-3">{p.periodStart ?? 'n/a'} to {p.periodEnd}</td><td className="pr-3 text-right">{p.irr.status === 'solved' ? pct(p.irr.bps) : 'n/a'}</td><td className="pr-3 text-right">{multiple(p.tvpi)}</td><td className="pr-3 text-right">{multiple(p.dpi)}</td><td className="pr-3 text-right">{multiple(p.rvpi)}</td><td className="pr-3 text-right">{p.twr?.status === 'solved' ? pct(p.twr.bps) : 'n/a'}</td></tr>)}</tbody></table></div>}
        <details className="rounded-md border p-4"><summary className="cursor-pointer font-medium">How returns are calculated</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">{v.assumptions.map(a => <li key={a}>{a}</li>)}</ul></details>
      </TabsContent>

      <TabsContent value="allocation" className="space-y-6 pt-4">
        {v.currencyExposure.length > 1 ? <section><h3 className="text-xl font-semibold">By currency</h3><ul className="mt-2 grid gap-2 sm:grid-cols-3">{v.currencyExposure.map(c => <li key={c.label} className="rounded-md border p-3">{c.label}: {money(c.valueCents, c.label)}</li>)}</ul><p className="mt-1 text-sm text-muted-foreground">Shown separately; no exchange rates are applied.</p></section> : null}
        {!v.allocation.length ? <Empty>Allocation appears once holdings have values.</Empty> : v.allocation.map(a => <section key={a.currency} className="grid gap-4 lg:grid-cols-3">{(['assetClass', 'sector', 'geography'] as const).map(dim => <div key={dim} className="rounded-md border p-4"><h4 className="font-semibold">{dim === 'assetClass' ? 'By type' : dim === 'sector' ? 'By sector' : 'By region'} · {a.currency}</h4><ul className="mt-2 space-y-2">{a[dim].map(g => <li key={g.label}><div className="flex justify-between gap-2"><span>{g.label}</span><span className="tabular-nums">{g.pct ?? 0}%</span></div><div className="mt-1 h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${Math.min(100, g.pct ?? 0)}%` }} /></div></li>)}</ul></div>)}</section>)}
        <section className="space-y-3"><h3 className="text-xl font-semibold">Cash needs</h3>
          {v.liquidity.map(l => <div key={l.currency} className="space-y-3"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Stat label={`Cash on hand · ${l.currency}`} value={money(l.availableCashCents, l.currency)} note="Actual" /><Stat label="Still to pay on commitments" value={money(l.unfundedCents, l.currency)} note="Actual commitments" /><Stat label="Upcoming capital calls" value={money(l.projectedCallsCents, l.currency)} note="Projected" /><Stat label="Upcoming distributions" value={money(l.projectedDistributionsCents, l.currency)} note="Projected" /></div>
            {l.upcoming.length ? <ul className="divide-y rounded-md border">{l.upcoming.map(u => <li key={u.id} className="flex flex-wrap justify-between gap-2 p-3"><span><Badge variant="outline" className="mr-2">Projected</Badge>{u.kind === 'capital_call' ? 'Capital call' : 'Distribution'} · {u.name}</span><span>{u.amountCents === null ? 'Amount not set' : money(u.amountCents, u.currency)} · {u.date ?? 'date not set'}</span></li>)}</ul> : null}</div>)}
        </section>
      </TabsContent>

      <TabsContent value="cash" className="pt-4">
        <p className="mb-3 text-muted-foreground">Actual money in and out from {v.periodStart} to {v.asOf}. Projected amounts are not included.</p>
        {!v.cash.length ? <Empty>No cash activity recorded in this period.</Empty> : <ul className="divide-y rounded-md border">{v.cash.map(c => <li key={c.id} className="flex flex-wrap justify-between gap-2 p-3"><span>{c.date} · {c.name}</span><span className={`tabular-nums ${c.direction === 'inflow' ? 'text-primary' : ''}`}>{c.direction === 'inflow' ? '+' : '-'}{money(c.amountCents, c.currency)}</span></li>)}</ul>}
      </TabsContent>

      <TabsContent value="reports" className="pt-4"><Suspense fallback={<p className="text-muted-foreground">Loading reports…</p>}><WealthReportsPanel ownerUserId={ownerUserId} ownerLabel={ownerLabel} canPublish={canEdit} currentView={v} /></Suspense></TabsContent>

      <TabsContent value="quality" className="space-y-6 pt-4">
        {!v.issues.length ? <Empty>Nothing to check. Every counted value is dated and current.</Empty> : <ul className="space-y-2">{v.issues.map((i, n) => <li key={`${i.code}:${i.ref ?? n}`} className="flex gap-2 rounded-md border p-3">{i.severity === 'warning' ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" /> : <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}<span>{i.message}</span></li>)}</ul>}
        <Suspense fallback={null}><AuditTrail ownerUserId={ownerUserId} /></Suspense>
      </TabsContent>
    </Tabs>

    {canEdit ? <>
      <HoldingDialog open={dialog === 'holding'} onOpenChange={close} editing={holdingEdit} entities={v.entities} onDone={refresh} />
      <EntityDialog open={dialog === 'entity'} onOpenChange={close} editing={entityEdit} profiles={data.profiles} onDone={refresh} />
      <OwnershipDialog open={dialog === 'link'} onOpenChange={close} editing={linkEdit} entities={v.entities} onDone={refresh} />
      <CommitmentDialog open={dialog === 'commitment'} onOpenChange={close} editing={commitmentEdit} entities={v.entities} holdings={data.holdingOptions} onDone={refresh} />
      <CashFlowDialog open={dialog === 'flow'} onOpenChange={close} commitments={v.commitments} onDone={refresh} />
      <ImportDialog open={dialog === 'import'} onOpenChange={close} onDone={refresh} />
    </> : null}
  </div>;
}

const ACTION_LABELS: Record<string, string> = { 'holding.added': 'Holding added', 'holding.corrected': 'Holding updated', 'holding.archived': 'Holding removed', 'entity.added': 'Entity added', 'entity.corrected': 'Entity updated', 'entity.archived': 'Entity removed', 'ownership.added': 'Ownership added', 'ownership.corrected': 'Ownership changed', 'ownership.archived': 'Ownership removed', 'commitment.added': 'Private investment added', 'commitment.corrected': 'Private investment updated', 'commitment.archived': 'Private investment removed', 'cash_flow.added': 'Cash flow recorded', 'import.committed': 'Spreadsheet imported', 'import.failed': 'Import failed', 'report.published': 'Report published' };
function AuditTrail({ ownerUserId }: { ownerUserId?: string | undefined }) {
  const load = useServerFn(getWealthAuditTrail);
  const { data } = useSuspenseQuery({ queryKey: ['wealth-audit', ownerUserId ?? 'me'], queryFn: () => load({ data: ownerUserId ? { ownerUserId } : {} }) });
  return <section className="space-y-2"><h3 className="text-xl font-semibold">Change history</h3>{!data.length ? <Empty>No changes recorded yet.</Empty> : <ul className="divide-y rounded-md border">{data.map(e => <li key={e.id} className="flex flex-wrap justify-between gap-2 p-3 text-base"><span>{ACTION_LABELS[e.action] ?? e.action}{e.summary ? ` · ${e.summary}` : ''}</span><span className="text-sm text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</span></li>)}</ul>}</section>;
}
