import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { saveWealthHolding } from '@/lib/wealth-services.functions';
import { saveWealthPortfolioRecord, previewWealthImport, commitWealthImport } from '@/lib/wealth-portfolio.functions';
import { WEALTH_ASSET_CLASSES } from '@/lib/wealth-services';
import { ASSET_CLASS_LABELS, ENTITY_TYPES, ENTITY_TYPE_LABELS, HOLDING_COLUMNS, FLOW_COLUMNS, SELF, type PortfolioView, type EntityType } from '@/lib/wealth-portfolio-model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const today = () => new Date().toISOString().slice(0, 10);
const toCents = (v: string) => v.trim() === '' ? null : Math.round(Number(v.replace(/[$,\s]/g, '')) * 100);
const NONE = 'none';
type Entities = PortfolioView['entities'];
type Done = () => void | Promise<void>;

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <div className="space-y-1.5"><Label className="grid gap-1.5 text-base font-medium">{label}{children}</Label>{hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}</div>;
}
function EntitySelect({ value, onChange, entities, selfLabel = 'You directly', noneValue = NONE }: { value: string; onChange: (v: string) => void; entities: Entities; selfLabel?: string; noneValue?: string }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={noneValue}>{selfLabel}</SelectItem>{entities.map(e => <SelectItem key={e.recordId} value={e.recordId}>{e.name}</SelectItem>)}</SelectContent></Select>;
}

export type HoldingEdit = { observationId: string; name: string; assetClass: string; currency: string; valueCents: number | null; costCents: number | null; sector: string; geography: string; holderEntityId: string | null; representsEntityId: string | null; sourceNote?: string };

export function HoldingDialog({ open, onOpenChange, editing, entities, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; editing: HoldingEdit | null; entities: Entities; onDone: Done }) {
  const save = useServerFn(saveWealthHolding);
  const init = () => ({ name: editing?.name ?? '', assetClass: editing?.assetClass ?? 'cash', currency: editing?.currency ?? 'USD', value: editing?.valueCents == null ? '' : String(editing.valueCents / 100), cost: editing?.costCents == null ? '' : String(editing.costCents / 100), asOf: today(), sector: editing && editing.sector !== 'Not recorded' ? editing.sector : '', geography: editing && editing.geography !== 'Not recorded' ? editing.geography : '', holder: editing?.holderEntityId ?? NONE, represents: editing?.representsEntityId ?? NONE, sourceNote: '', archived: false });
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const k = `${open}:${editing?.observationId ?? 'new'}`;
  if (k !== key) { setKey(k); setF(init()); }
  const submit = async (archived = false) => {
    setBusy(true);
    try {
      await save({ data: { ...(editing ? { priorId: editing.observationId } : {}), name: f.name, assetClass: f.assetClass as typeof WEALTH_ASSET_CLASSES[number], currency: f.currency, valueCents: toCents(f.value), costCents: toCents(f.cost), asOf: f.asOf, sourceNote: f.sourceNote || (archived ? 'Removed from portfolio' : ''), archived, sector: f.sector || null, geography: f.geography || null, holderEntityId: f.holder === NONE ? null : f.holder, representsEntityId: f.represents === NONE ? null : f.represents } });
      toast.success(archived ? 'Holding removed. Its history is kept.' : editing ? 'Correction saved. The earlier value is kept in history.' : 'Holding added');
      onOpenChange(false); await onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle className="text-xl">{editing ? 'Update this holding' : 'Add a holding'}</DialogTitle><DialogDescription className="text-base">{editing ? 'Saving records a new dated value. The earlier entry stays in history.' : 'Enter what you hold and its value on a date.'}</DialogDescription></DialogHeader>
    <form className="grid gap-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <Field label="Name"><Input required maxLength={160} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type"><Select value={f.assetClass} onValueChange={v => setF({ ...f, assetClass: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{WEALTH_ASSET_CLASSES.map(c => <SelectItem key={c} value={c}>{ASSET_CLASS_LABELS[c] ?? c}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Currency"><Input required maxLength={3} pattern="[A-Z]{3}" value={f.currency} onChange={e => setF({ ...f, currency: e.target.value.toUpperCase() })} /></Field>
        <Field label="Value"><Input inputMode="decimal" value={f.value} onChange={e => setF({ ...f, value: e.target.value })} placeholder="Leave blank if unknown" /></Field>
        <Field label="Cost (optional)"><Input inputMode="decimal" value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} /></Field>
        <Field label="Value date"><Input required type="date" max={today()} value={f.asOf} onChange={e => setF({ ...f, asOf: e.target.value })} /></Field>
        <Field label="Held by"><EntitySelect value={f.holder} onChange={v => setF({ ...f, holder: v })} entities={entities} /></Field>
        <Field label="Sector (optional)"><Input maxLength={80} value={f.sector} onChange={e => setF({ ...f, sector: e.target.value })} /></Field>
        <Field label="Region (optional)"><Input maxLength={80} value={f.geography} onChange={e => setF({ ...f, geography: e.target.value })} /></Field>
      </div>
      <Field label="This holding is my interest in" hint="Pick an entity only when this line is your stake in it. If that entity's own holdings are entered, this line is not counted, so nothing is counted twice."><EntitySelect value={f.represents} onChange={v => setF({ ...f, represents: v })} entities={entities} selfLabel="Not an entity interest" /></Field>
      <Field label="Where the value comes from"><Input required minLength={3} maxLength={1000} value={f.sourceNote} onChange={e => setF({ ...f, sourceNote: e.target.value })} placeholder="For example: September brokerage statement" /></Field>
      <DialogFooter className="gap-2 sm:justify-between">{editing ? <Button type="button" variant="outline" disabled={busy || f.sourceNote.trim().length < 3} onClick={() => { if (window.confirm('Remove this holding from your portfolio? Its history is kept.')) void submit(true); }}>Remove holding</Button> : <span />}<Button type="submit" size="lg" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></DialogFooter>
    </form></DialogContent></Dialog>;
}

export function EntityDialog({ open, onOpenChange, editing, profiles, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; editing: Entities[number] | null; profiles: { id: string; label: string }[]; onDone: Done }) {
  const save = useServerFn(saveWealthPortfolioRecord);
  const [f, setF] = useState({ name: '', entityType: 'trust' as EntityType, profile: NONE });
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const k = `${open}:${editing?.recordId ?? 'new'}`;
  if (k !== key) { setKey(k); setF({ name: editing?.name ?? '', entityType: editing?.entityType ?? 'trust', profile: editing?.investmentProfileId ?? NONE }); }
  const submit = async (archived = false) => {
    setBusy(true);
    try { await save({ data: { kind: 'entity', ...(editing?.rowId ? { priorId: editing.rowId } : {}), archived, detail: { name: f.name, entityType: f.entityType, investmentProfileId: f.profile === NONE ? null : f.profile } } }); toast.success(archived ? 'Entity removed' : 'Entity saved'); onOpenChange(false); await onDone(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle className="text-xl">{editing ? 'Update entity' : 'Add a trust, company or account'}</DialogTitle><DialogDescription className="text-base">Then add who owns it and what share.</DialogDescription></DialogHeader>
    <form className="grid gap-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <Field label="Name"><Input required maxLength={160} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Type"><Select value={f.entityType} onValueChange={v => setF({ ...f, entityType: v as EntityType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ENTITY_TYPES.map(t => <SelectItem key={t} value={t}>{ENTITY_TYPE_LABELS[t]}</SelectItem>)}</SelectContent></Select></Field>
      {profiles.length ? <Field label="Invests in funds as" hint="Link it to the investing party you use for fund investments, so those funds are counted at this entity's share."><Select value={f.profile} onValueChange={v => setF({ ...f, profile: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>Not linked</SelectItem>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent></Select></Field> : null}
      <DialogFooter className="gap-2 sm:justify-between">{editing ? <Button type="button" variant="outline" disabled={busy} onClick={() => { if (window.confirm('Remove this entity? Holdings it holds will stop counting until moved.')) void submit(true); }}>Remove</Button> : <span />}<Button type="submit" size="lg" disabled={busy}>Save</Button></DialogFooter>
    </form></DialogContent></Dialog>;
}

export function OwnershipDialog({ open, onOpenChange, entities, editing, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; entities: Entities; editing: PortfolioView['links'][number] | null; onDone: Done }) {
  const save = useServerFn(saveWealthPortfolioRecord);
  const [f, setF] = useState({ parentId: SELF, childId: '', pct: '' });
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const k = `${open}:${editing?.recordId ?? 'new'}`;
  if (k !== key) { setKey(k); setF({ parentId: editing?.parentId ?? SELF, childId: editing?.childId ?? entities[0]?.recordId ?? '', pct: editing?.pctBps == null ? '' : String(editing.pctBps / 100) }); }
  const submit = async (archived = false) => {
    const pctBps = f.pct.trim() === '' ? null : Math.round(Number(f.pct) * 100);
    if (pctBps !== null && (!Number.isFinite(pctBps) || pctBps < 0 || pctBps > 10000)) { toast.error('Enter a share between 0 and 100.'); return; }
    setBusy(true);
    try { await save({ data: { kind: 'ownership', ...(editing?.rowId ? { priorId: editing.rowId } : {}), archived, detail: { parentId: f.parentId, childId: f.childId, pctBps } } }); toast.success(archived ? 'Ownership removed' : 'Ownership saved'); onOpenChange(false); await onDone(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle className="text-xl">Who owns what share</DialogTitle><DialogDescription className="text-base">Shares multiply along the chain. For example, 50% of a trust that owns 40% of a company counts as 20%.</DialogDescription></DialogHeader>
    <form className="grid gap-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <Field label="Owner"><EntitySelect value={f.parentId} onChange={v => setF({ ...f, parentId: v })} entities={entities.filter(e => e.recordId !== f.childId)} selfLabel="You" noneValue={SELF} /></Field>
      <Field label="Owns"><Select value={f.childId} onValueChange={v => setF({ ...f, childId: v })}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{entities.map(e => <SelectItem key={e.recordId} value={e.recordId}>{e.name}</SelectItem>)}</SelectContent></Select></Field>
      <Field label="Share (%)" hint="Leave blank if you do not know yet. It will be flagged and not counted."><Input inputMode="decimal" value={f.pct} onChange={e => setF({ ...f, pct: e.target.value })} /></Field>
      <DialogFooter className="gap-2 sm:justify-between">{editing ? <Button type="button" variant="outline" disabled={busy} onClick={() => void submit(true)}>Remove</Button> : <span />}<Button type="submit" size="lg" disabled={busy || !f.childId}>Save</Button></DialogFooter>
    </form></DialogContent></Dialog>;
}

export function CommitmentDialog({ open, onOpenChange, entities, holdings, editing, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; entities: Entities; holdings: { holdingId: string; name: string }[]; editing: PortfolioView['commitments'][number] | null; onDone: Done }) {
  const save = useServerFn(saveWealthPortfolioRecord);
  const [f, setF] = useState({ name: '', currency: 'USD', commitment: '', holder: NONE, holding: NONE, startDate: today() });
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const k = `${open}:${editing?.recordId ?? 'new'}`;
  if (k !== key) { setKey(k); setF({ name: editing?.name ?? '', currency: editing?.currency ?? 'USD', commitment: editing ? String(editing.commitmentCents / 100) : '', holder: editing?.holderEntityId ?? NONE, holding: editing?.holdingId ?? NONE, startDate: editing?.startDate ?? today() }); }
  const submit = async (archived = false) => {
    setBusy(true);
    try { await save({ data: { kind: 'commitment', ...(editing?.rowId ? { priorId: editing.rowId } : {}), archived, detail: { name: f.name, currency: f.currency, commitmentCents: toCents(f.commitment) ?? 0, holderEntityId: f.holder === NONE ? null : f.holder, holdingId: f.holding === NONE ? null : f.holding, startDate: f.startDate } } }); toast.success('Private investment saved'); onOpenChange(false); await onDone(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle className="text-xl">{editing ? 'Update private investment' : 'Add an outside private investment'}</DialogTitle><DialogDescription className="text-base">For funds or deals not run on this platform. Platform funds appear automatically.</DialogDescription></DialogHeader>
    <form className="grid gap-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <Field label="Name"><Input required maxLength={160} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Commitment"><Input required inputMode="decimal" value={f.commitment} onChange={e => setF({ ...f, commitment: e.target.value })} /></Field><Field label="Currency"><Input required maxLength={3} pattern="[A-Z]{3}" value={f.currency} onChange={e => setF({ ...f, currency: e.target.value.toUpperCase() })} /></Field></div>
      <Field label="Start date"><Input required type="date" value={f.startDate} onChange={e => setF({ ...f, startDate: e.target.value })} /></Field>
      <Field label="Held by"><EntitySelect value={f.holder} onChange={v => setF({ ...f, holder: v })} entities={entities} /></Field>
      <Field label="Value comes from holding" hint="Pick the holding where you record this investment's value, so returns can use it."><Select value={f.holding} onValueChange={v => setF({ ...f, holding: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>Not linked yet</SelectItem>{holdings.map(h => <SelectItem key={h.holdingId} value={h.holdingId}>{h.name}</SelectItem>)}</SelectContent></Select></Field>
      <DialogFooter className="gap-2 sm:justify-between">{editing ? <Button type="button" variant="outline" disabled={busy} onClick={() => { if (window.confirm('Remove this private investment? Its history is kept.')) void submit(true); }}>Remove</Button> : <span />}<Button type="submit" size="lg" disabled={busy}>Save</Button></DialogFooter>
    </form></DialogContent></Dialog>;
}

export function CashFlowDialog({ open, onOpenChange, commitments, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; commitments: PortfolioView['commitments']; onDone: Done }) {
  const save = useServerFn(saveWealthPortfolioRecord);
  const [f, setF] = useState({ commitmentId: '', date: today(), flowType: 'contribution' as 'contribution' | 'distribution', status: 'actual' as 'actual' | 'projected', amount: '', note: '' });
  const [busy, setBusy] = useState(false);
  const commitmentId = f.commitmentId || commitments[0]?.recordId || '';
  const submit = async () => {
    setBusy(true);
    try { await save({ data: { kind: 'cash_flow', detail: { commitmentId, date: f.date, flowType: f.flowType, status: f.status, amountCents: toCents(f.amount) ?? 0, note: f.note } } }); toast.success('Cash flow recorded'); onOpenChange(false); setF({ ...f, amount: '', note: '' }); await onDone(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle className="text-xl">Record a cash flow</DialogTitle><DialogDescription className="text-base">Money you paid in or received. Mark future amounts as projected; they never change actual results.</DialogDescription></DialogHeader>
    <form className="grid gap-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <Field label="Private investment"><Select value={commitmentId} onValueChange={v => setF({ ...f, commitmentId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{commitments.map(c => <SelectItem key={c.recordId} value={c.recordId}>{c.name}</SelectItem>)}</SelectContent></Select></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kind"><Select value={f.flowType} onValueChange={v => setF({ ...f, flowType: v as typeof f.flowType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="contribution">Paid in</SelectItem><SelectItem value="distribution">Received</SelectItem></SelectContent></Select></Field>
        <Field label="Status"><Select value={f.status} onValueChange={v => setF({ ...f, status: v as typeof f.status })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="actual">Actual</SelectItem><SelectItem value="projected">Projected</SelectItem></SelectContent></Select></Field>
        <Field label="Date"><Input required type="date" max={f.status === 'actual' ? today() : undefined} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Amount"><Input required inputMode="decimal" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Field>
      </div>
      <Field label="Note (optional)"><Input maxLength={500} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></Field>
      <DialogFooter><Button type="submit" size="lg" disabled={busy || !commitmentId}>Save</Button></DialogFooter>
    </form></DialogContent></Dialog>;
}

type Preview = Awaited<ReturnType<typeof previewWealthImport>>;
export function ImportDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: Done }) {
  const preview = useServerFn(previewWealthImport), commit = useServerFn(commitWealthImport);
  const [kind, setKind] = useState<'holdings' | 'private_cash_flows'>('holdings');
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [result, setResult] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const columns = kind === 'holdings' ? HOLDING_COLUMNS : FLOW_COLUMNS;
  const ready = result?.rows.filter(r => r.status === 'ready').length ?? 0;
  const errors = result?.rows.filter(r => r.status === 'error').length ?? 0;
  const reset = () => { setFile(null); setResult(null); };
  const run = async (text: string, name: string) => { setBusy(true); try { setResult(await preview({ data: { kind, fileName: name, text } })); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  const doCommit = async () => {
    if (!file || !result) return;
    setBusy(true);
    try { const r = await commit({ data: { kind, fileName: file.name, text: file.text, expectedHash: result.hash } }); toast.success(`${r.imported} row(s) imported${r.skipped ? `, ${r.skipped} already recorded and skipped` : ''}`); reset(); onOpenChange(false); await onDone(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const template = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([columns.join(',') + '\n'], { type: 'text/csv' })); a.download = `${kind}-template.csv`; a.click(); URL.revokeObjectURL(a.href); };
  return <Dialog open={open} onOpenChange={o => { onOpenChange(o); if (!o) reset(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle className="text-xl">Import from a spreadsheet</DialogTitle><DialogDescription className="text-base">Check every row before anything is saved. Rows already recorded are skipped.</DialogDescription></DialogHeader>
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3"><Field label="What are you importing?"><Select value={kind} onValueChange={v => { setKind(v as typeof kind); reset(); }}><SelectTrigger className="w-64"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="holdings">Holdings and values</SelectItem><SelectItem value="private_cash_flows">Private investment cash flows</SelectItem></SelectContent></Select></Field><Button variant="outline" onClick={template}>Download blank template</Button></div>
      <p className="text-sm text-muted-foreground">Columns: {columns.join(', ')}. Dates as YYYY-MM-DD.</p>
      <Input type="file" accept=".csv,text/csv" aria-label="Choose CSV file" onChange={async e => { const fl = e.target.files?.[0]; if (!fl) return; if (fl.size > 500_000) { toast.error('Files up to 500 KB.'); return; } const text = await fl.text(); setFile({ name: fl.name, text }); await run(text, fl.name); }} />
      {result ? <div className="space-y-3">
        {result.priorFile ? <p className="rounded-md border border-dashed p-3 text-base">This same file was imported before. Rows already saved will be skipped.</p> : null}
        {result.fileErrors.map(e => <p key={e} className="text-base text-destructive">{e}</p>)}
        <div className="flex flex-wrap gap-2 text-base"><Badge>{ready} ready</Badge><Badge variant="outline">{result.rows.length - ready - errors} already recorded</Badge>{errors ? <Badge variant="destructive">{errors} with problems</Badge> : null}</div>
        <div className="max-h-72 overflow-auto rounded-md border"><table className="w-full text-left text-sm"><thead className="bg-muted/50"><tr><th className="p-2">Row</th><th className="p-2">Status</th><th className="p-2">Details</th></tr></thead><tbody>{result.rows.map(r => <tr key={r.line} className="border-t"><td className="p-2">{r.line}</td><td className="p-2">{r.status === 'ready' ? 'Ready' : r.status === 'duplicate' ? 'Already recorded' : 'Problem'}</td><td className="p-2">{r.errors.length ? r.errors.join(' ') : r.value ? Object.values(r.value as Record<string, unknown>).filter(v => v !== null && v !== '').slice(0, 4).join(' · ') : ''}</td></tr>)}</tbody></table></div>
      </div> : null}
    </div>
    <DialogFooter><Button size="lg" disabled={busy || !result || !ready || errors > 0 || result.fileErrors.length > 0} onClick={() => void doCommit()}>{busy ? 'Working…' : `Import ${ready} row(s)`}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
