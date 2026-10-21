import { Suspense, useState } from 'react';
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import { Plus, Pencil, Download } from 'lucide-react';
import { toast } from 'sonner';
import { getWealthServices, saveWealthHolding, selectWealthServices } from '@/lib/wealth-services.functions';
import { WEALTH_SERVICES, WEALTH_ASSET_CLASSES, currentWealthHoldings, type WealthObservation, type WealthServiceKey } from '@/lib/wealth-services';
import { ReportCardsWorkspace } from '@/components/report-cards-workspace';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
const today = () => new Date().toISOString().slice(0,10);
const usd = (v: number, currency: string) => new Intl.NumberFormat('en-US',{style:'currency',currency}).format(v/100);
const blank = () => ({ name:'',assetClass:'cash' as typeof WEALTH_ASSET_CLASSES[number],currency:'USD',cost:'',value:'',asOf:today(),sourceNote:'' });
export function WealthWorkspace() {
  const load=useServerFn(getWealthServices), save=useServerFn(saveWealthHolding), choose=useServerFn(selectWealthServices), qc=useQueryClient();
  const {data}=useSuspenseQuery({queryKey:['wealth-services'],queryFn:()=>load()});
  const [scope,setScope]=useState('personal'), [selection,setSelection]=useState<WealthServiceKey[]|null>(null), [date,setDate]=useState(today()), [busy,setBusy]=useState(false);
  const [editing,setEditing]=useState<WealthObservation|null>(null), [open,setOpen]=useState(false), [form,setForm]=useState(blank());
  const latest=data.selections.find(s=>(s.offering_id??'personal')===scope);
  const selected=selection??(latest?.services??[]);
  const owner=data.history[0]?.owner_user_id??'';
  const rows=currentWealthHoldings(data.history,owner,date);
  const currencies=[...new Set(rows.map(r=>r.currency))];
  const refresh=()=>qc.invalidateQueries({queryKey:['wealth-services']});
  const edit=(r:WealthObservation|null)=>{setEditing(r);setForm(r?{name:r.name,assetClass:r.asset_class as typeof WEALTH_ASSET_CLASSES[number],currency:r.currency,cost:r.cost_cents===null?'':String(r.cost_cents/100),value:r.value_cents===null?'':String(r.value_cents/100),asOf:today(),sourceNote:r.source_note}:blank());setOpen(true);};
  const submit=async()=>{setBusy(true);try{await save({data:{...(editing?{priorId:editing.id}:{}),name:form.name,assetClass:form.assetClass,currency:form.currency,costCents:form.cost===''?null:Math.round(Number(form.cost)*100),valueCents:form.value===''?null:Math.round(Number(form.value)*100),asOf:form.asOf,sourceNote:form.sourceNote}});setOpen(false);await refresh();toast.success('Holding recorded');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}};
  return <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl">Wealth & services</h1><Badge variant="outline">Private personal records</Badge></header>
    <section className="space-y-4 border-b pb-6"><div className="max-w-md space-y-2"><Label>Service scope</Label><Select value={scope} onValueChange={v=>{setScope(v);setSelection(null);}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="personal">Standalone · personal wealth</SelectItem>{data.funds.map(f=><SelectItem key={f.id} value={f.id}>Fund add-on · {f.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid gap-3 sm:grid-cols-2">{WEALTH_SERVICES.map(s=><label key={s.key} className="flex cursor-pointer items-start gap-3 rounded-md border p-4"><Checkbox checked={selected.includes(s.key)} onCheckedChange={()=>setSelection(selected.includes(s.key)?selected.filter(k=>k!==s.key) as WealthServiceKey[]:[...selected,s.key] as WealthServiceKey[])}/><span><span className="block font-medium">{s.label}</span><span className="text-sm text-muted-foreground">{s.detail}</span></span></label>)}</div>
      <div className="flex flex-wrap items-center gap-3"><Button disabled={busy} onClick={async()=>{setBusy(true);try{await choose({data:{offeringId:scope==='personal'?null:scope,services:selected as WealthServiceKey[]}});setSelection(null);await refresh();toast.success('Service preferences saved');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}}>Save service preferences</Button><span className="text-sm text-muted-foreground">Pricing by approved quote. No charge or subscription is started.</span>{scope!=='personal'?<Button asChild variant="outline"><Link to="/client/services/request">Request services</Link></Button>:null}</div>
    </section>
    <Tabs defaultValue="portfolio"><TabsList><TabsTrigger value="portfolio">Personal portfolio</TabsTrigger><TabsTrigger value="report-cards">Personal Report Cards</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>
      <TabsContent value="portfolio" className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div className="space-y-2"><Label htmlFor="wealth-date">As of</Label><Input id="wealth-date" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div><Button onClick={()=>edit(null)}><Plus className="mr-2 size-4"/>Add holding</Button></div>
        <div className="grid gap-5 border-y py-5 sm:grid-cols-3"><div><p className="text-sm text-muted-foreground">Holdings</p><p className="text-2xl">{rows.length}</p></div>{currencies.map(c=>{const values=rows.filter(r=>r.currency===c);return <div key={c}><p className="text-sm text-muted-foreground">Recorded value · {c}</p><p className="text-2xl">{values.every(r=>r.value_cents!==null)?usd(values.reduce((n,r)=>n+Number(r.value_cents),0),c):'Incomplete'}</p></div>;})}</div>
        <p className="text-sm text-muted-foreground">Owner-recorded values; not verified valuations or fund accounting. Currencies are shown separately.</p>
        {!rows.length?<p className="py-6 text-muted-foreground">No personal holdings recorded for this date.</p>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-muted-foreground"><tr><th className="py-3">Holding</th><th>Class</th><th>Cost</th><th>Value</th><th>As of</th><th>Source</th><th/></tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-t"><td className="py-3 font-medium">{r.name}</td><td>{r.asset_class.replaceAll('_',' ')}</td><td>{r.cost_cents===null?'Not recorded':usd(r.cost_cents,r.currency)}</td><td>{r.value_cents===null?'Not recorded':usd(r.value_cents,r.currency)}</td><td>{r.as_of}</td><td className="max-w-48 break-words">{r.source_note}</td><td><Button size="icon" variant="ghost" title="Record correction" aria-label={`Update ${r.name}`} onClick={()=>edit(r)}><Pencil className="size-4"/></Button></td></tr>)}</tbody></table></div>}
        <Button asChild variant="outline"><Link to="/my-portfolio">Harmonious fund holdings</Link></Button>
      </TabsContent>
      <TabsContent value="report-cards"><Suspense fallback={<p>Loading Report Cards…</p>}><ReportCardsWorkspace kind="investor"/></Suspense></TabsContent>
      <TabsContent value="history" className="space-y-3"><Button variant="outline" onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({holdings:data.history,services:data.selections},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='harmonious-wealth-history.json';a.click();URL.revokeObjectURL(url);}}><Download className="mr-2 size-4"/>Export history</Button>{data.history.map(r=><div key={r.id} className="border-b py-3 text-sm"><b>{r.name}</b> · {r.as_of} · {r.supersedes_id?'Correction':'First observation'}<p className="text-muted-foreground">{r.source_note}</p></div>)}</TabsContent>
    </Tabs>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{editing?'Record a correction':'Add personal holding'}</DialogTitle></DialogHeader><form className="grid gap-3" onSubmit={e=>{e.preventDefault();void submit();}}><Label>Holding name<Input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Label><Label>Asset class<Select value={form.assetClass} onValueChange={v=>setForm({...form,assetClass:v as typeof form.assetClass})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{WEALTH_ASSET_CLASSES.map(c=><SelectItem key={c} value={c}>{c.replaceAll('_',' ')}</SelectItem>)}</SelectContent></Select></Label><Label>Currency<Input required maxLength={3} pattern="[A-Z]{3}" value={form.currency} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase()})}/></Label><div className="grid grid-cols-2 gap-3"><Label>Cost<Input type="number" min="0" step="0.01" value={form.cost} onChange={e=>setForm({...form,cost:e.target.value})}/></Label><Label>Recorded value<Input type="number" min="0" step="0.01" value={form.value} onChange={e=>setForm({...form,value:e.target.value})}/></Label></div><Label>As of<Input required type="date" min={editing?.as_of} value={form.asOf} onChange={e=>setForm({...form,asOf:e.target.value})}/></Label><Label>Source / correction reason<Input required minLength={3} value={form.sourceNote} onChange={e=>setForm({...form,sourceNote:e.target.value})}/></Label><Button type="submit" disabled={busy}>Save holding</Button></form></DialogContent></Dialog>
  </main>;
}