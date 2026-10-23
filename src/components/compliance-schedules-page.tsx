import { useState } from 'react';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { REPORT_SECTIONS, REPORT_TYPES, type ReportSection, type ReportType } from '@/lib/compliance-schedule-model';
import { decideComplianceDelivery, getComplianceSchedules, saveComplianceSchedule } from '@/lib/compliance-schedules.functions';


export function ComplianceSchedulesPage() {
  const load = useServerFn(getComplianceSchedules), save = useServerFn(saveComplianceSchedule), decide = useServerFn(decideComplianceDelivery), qc = useQueryClient();
  const { data } = useSuspenseQuery({ queryKey: ['compliance-schedules'], queryFn: () => load() });
  const [name, setName] = useState(''), [type, setType] = useState<ReportType>('combined'), [freq, setFreq] = useState<'weekly' | 'monthly' | 'quarterly'>('monthly'), [recipients, setRecipients] = useState(''), [first, setFirst] = useState(new Date().toISOString().slice(0, 10)), [reasons, setReasons] = useState<Record<string, string>>({});
  const [sections, setSections] = useState<ReportSection[]>(Object.keys(REPORT_SECTIONS) as ReportSection[]);
  const [outside, setOutside] = useState<{ email: string; reason: string; confirmed: boolean }[]>([]);
  const refresh = () => qc.invalidateQueries({ queryKey: ['compliance-schedules'] });
  const create = async () => { try { await save({ data: { name, reportType: type, frequency: freq, recipients: recipients.split(/[,\s]+/).filter(Boolean), firstRunOn: first, active: true, sections, outsideRecipients: outside.filter((o) => o.email.trim()) } }); toast.success('Schedule saved'); setName(''); setRecipients(''); setOutside([]); refresh(); } catch (e) { toast.error((e as Error).message); } };
  const toggle = async (s: any) => { try { await save({ data: { id: s.id, name: s.name, reportType: s.reportType, frequency: s.frequency, recipients: s.recipients, firstRunOn: s.nextRunOn, active: !s.active } }); refresh(); } catch (e) { toast.error((e as Error).message); } };
  const act = async (id: string, decision: 'approved' | 'rejected') => { try { const r = await decide({ data: { id, decision, reason: reasons[id] ?? '' } }); toast.success(r.status === 'sent' ? 'Approved and sent' : r.status === 'failed' ? 'Approved, but sending failed' : 'Report rejected'); refresh(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div><h1 className="text-3xl">Compliance report schedules</h1><p className="text-sm text-muted-foreground">Recurring internal summaries of compliance items and holds. Each report is prepared on schedule and sent only after a different team member approves it. These are reports — nothing is filed or paid.</p></div>
      <Card><CardHeader><CardTitle className="text-base">New schedule</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
        <Input aria-label="Schedule name" placeholder="Schedule name" value={name} onChange={(e) => setName(e.target.value)} />
        <select aria-label="Report" className="h-10 rounded-md border bg-background px-3 text-sm" value={type} onChange={(e) => setType(e.target.value as ReportType)}>{Object.entries(REPORT_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select aria-label="Frequency" className="h-10 rounded-md border bg-background px-3 text-sm" value={freq} onChange={(e) => setFreq(e.target.value as any)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option></select>
        <Input aria-label="First report on" type="date" value={first} onChange={(e) => setFirst(e.target.value)} />
        <Input aria-label="Recipients" className="sm:col-span-2" placeholder="Recipients (harmonious.co addresses, comma separated)" value={recipients} onChange={(e) => setRecipients(e.target.value)} />
        <fieldset className="space-y-1 text-sm sm:col-span-2"><legend className="font-medium">Sections</legend>
          {(Object.entries(REPORT_SECTIONS) as [ReportSection, string][]).map(([k, l]) => <label key={k} className="mr-4 inline-flex items-center gap-2"><input type="checkbox" checked={sections.includes(k)} onChange={(e) => setSections(e.target.checked ? [...sections, k] : sections.filter((x) => x !== k))} />{l}</label>)}
        </fieldset>
        <fieldset className="space-y-2 text-sm sm:col-span-2"><legend className="font-medium">Outside recipients</legend>
          <p className="text-xs text-muted-foreground">Outside addresses get counts only, never names. Each needs a reason and confirmation.</p>
          {outside.map((o, i) => { const set = (v: Partial<typeof o>) => setOutside(outside.map((x, j) => (j === i ? { ...x, ...v } : x))); return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input aria-label="Outside email" className="max-w-xs" placeholder="name@firm.com" value={o.email} onChange={(e) => set({ email: e.target.value })} />
              <Input aria-label="Reason" className="max-w-xs" placeholder="Reason (e.g. fund counsel)" value={o.reason} onChange={(e) => set({ reason: e.target.value })} />
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={o.confirmed} onChange={(e) => set({ confirmed: e.target.checked })} />I confirm this outside address</label>
              <Button size="sm" variant="ghost" onClick={() => setOutside(outside.filter((_, j) => j !== i))}>Remove</Button>
            </div>); })}
          <Button size="sm" variant="outline" onClick={() => setOutside([...outside, { email: '', reason: '', confirmed: false }])}>Add outside recipient</Button>
        </fieldset>
        <Button className="sm:col-span-2 sm:w-fit" onClick={create}>Save schedule</Button>
      </CardContent></Card>
      <section className="space-y-2"><h2 className="text-lg">Schedules</h2>
        {data.schedules.length === 0 ? <p className="text-sm text-muted-foreground">No schedules yet.</p> : data.schedules.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm">
            <span><b>{s.name}</b> · {REPORT_TYPES[s.reportType as ReportType]} · {s.frequency} · next {s.nextRunOn} · {s.recipients.join(', ')}</span>
            <span className="flex items-center gap-2"><Badge variant={s.active ? 'default' : 'secondary'}>{s.active ? 'Active' : 'Paused'}</Badge><Button size="sm" variant="outline" onClick={() => toggle(s)}>{s.active ? 'Pause' : 'Resume'}</Button></span>
          </div>
        ))}
      </section>
      <section className="space-y-3"><h2 className="text-lg">Delivery history</h2>
        {data.deliveries.length === 0 ? <p className="text-sm text-muted-foreground">No reports prepared yet. Reports are prepared automatically on their scheduled date.</p> : data.deliveries.map((d) => (
          <Card key={d.id}><CardContent className="space-y-2 pt-5 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><b>{d.scheduleName} · {d.periodOn}</b><Badge variant={d.status === 'sent' ? 'default' : 'secondary'}>{d.status.replace('_', ' ')}</Badge></div>
            <p className="text-muted-foreground">{d.snapshot?.reportType !== 'open_holds' ? `Open items ${d.snapshot?.openItems ?? 0} · overdue ${d.snapshot?.overdue ?? 0} · due in 30 days ${d.snapshot?.dueNext30Days ?? 0}` : ''}{d.snapshot?.reportType !== 'compliance_items_due' ? ` · open holds ${d.snapshot?.openHolds ?? 0}` : ''}</p>
            {(d.snapshot?.sections ?? []).map((x: any) => <div key={x.key}><p className="font-medium">{x.title}: {x.count}</p>{x.lines.length ? <ul className="ml-4 list-disc text-xs text-muted-foreground">{x.lines.map((l: string) => <li key={l}>{l}</li>)}</ul> : null}</div>)}
            {(d.snapshot?.outsideRecipients ?? []).length ? <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs"><b>Outside recipients (counts only):</b> {(d.snapshot.outsideRecipients as any[]).map((o) => `${o.email} · ${o.reason}`).join('; ')}</p> : null}
            <p className="text-xs text-muted-foreground">To {d.recipients.join(', ')}{d.decidedByName ? ` · ${d.status === 'rejected' ? 'Rejected' : 'Approved'} by ${d.decidedByName}` : ''}{d.reason ? ` · ${d.reason}` : ''}{d.error ? ` · ${d.error}` : ''}</p>
            {d.status === 'awaiting_approval' ? (d.preparedBy === data.viewerId ? <p className="text-xs text-muted-foreground">You created this schedule, so a different team member must approve it.</p> : (
              <div className="flex flex-wrap gap-2"><Input aria-label="Decision note" className="max-w-sm" placeholder="Note (optional)" value={reasons[d.id] ?? ''} onChange={(e) => setReasons({ ...reasons, [d.id]: e.target.value })} /><Button size="sm" onClick={() => act(d.id, 'approved')}>Approve and send</Button><Button size="sm" variant="outline" onClick={() => act(d.id, 'rejected')}>Reject</Button></div>
            )) : null}
          </CardContent></Card>
        ))}
      </section>
    </main>
  );
}
