import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getFundCalendar, saveCalendarItem, saveCalendarRule, generateFundSchedule, generateFundDueTasks, getCalendarItemHistory } from "@/lib/fund-command-center.functions";
import { CALENDAR_CATEGORIES, type CalendarCategory } from "@/lib/fund-calendar-templates";
import { RESPONSIBILITY_LABEL, RESPONSIBILITY_STATUSES } from "@/lib/responsibility";
import { ResponsibilityBadge } from "@/components/responsibility-badge";
import { fmtDate, titleCase } from "@/lib/service-engagement-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const REPORT = ["SCHEDULED", "PREPARING", "INTERNAL_REVIEW", "CLIENT_REVIEW", "FINAL", "RELEASED"];
const sel = "h-8 rounded-md border bg-background px-2 text-sm";

export function FundCalendar({ fundId }: { fundId: string }) {
  const load = useServerFn(getFundCalendar);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["fund-calendar", fundId], queryFn: () => load({ data: { fundId } }) });
  const gen = useServerFn(generateFundSchedule); const due = useServerFn(generateFundDueTasks);
  const [cat, setCat] = useState<"ALL" | CalendarCategory>("ALL");
  const [past, setPast] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["fund-calendar", fundId] }); qc.invalidateQueries({ queryKey: ["fund-command-center", fundId] }); qc.invalidateQueries({ queryKey: ["staff-tasks"] }); };
  const run = async (fn: () => Promise<any>, ok: (r: any) => string) => { setBusy(true); try { toast.success(ok(await fn())); refresh(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  const items = useMemo(() => (q.data?.items ?? []).filter((i: any) => (cat === "ALL" || i.category === cat) && (past || i.due_date >= today || i.status === "SCHEDULED" || i.status === "IN_PROGRESS")), [q.data, cat, past, today]);
  const byMonth = useMemo(() => { const m = new Map<string, any[]>(); for (const i of items) { const k = i.due_date.slice(0, 7); m.set(k, [...(m.get(k) ?? []), i]); } return [...m]; }, [items]);
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading calendar…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const staff = q.data!.staff;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value as any)} className={sel}>
          <option value="ALL">All categories</option>{Object.entries(CALENDAR_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} /> Show completed / past</label>
        {staff && <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => gen({ data: { fundId } }), (r) => `Schedule updated: ${r.rulesAdded} rules added, ${r.itemsCreated} dates added, ${r.tasksCreated} tasks created.`)}>Build schedule from services</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => due({ data: { fundId } }), (r) => `${r.created} task(s) created.`)}>Create due tasks</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowRules(!showRules)}>{showRules ? "Hide" : "Recurring"} rules ({q.data!.rules.length})</Button>
        </div>}
      </div>
      {staff && showRules && <Rules fundId={fundId} rules={q.data!.rules} onSaved={refresh} />}
      {staff && <NewItem fundId={fundId} onSaved={refresh} />}
      {byMonth.length ? byMonth.map(([month, list]) => (
        <section key={month} className="rounded-xl border bg-card">
          <h3 className="border-b px-4 py-2 text-sm font-semibold">{new Date(`${month}-01T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h3>
          <ul className="divide-y">{list.map((i: any) => {
            const overdue = (i.status === "SCHEDULED" || i.status === "IN_PROGRESS") && i.due_date < today;
            return (
              <li key={i.id} className="px-4 py-2">
                <button type="button" className="w-full text-left" onClick={() => staff && setOpenId(openId === i.id ? null : i.id)}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("font-medium", i.status === "DONE" && "text-muted-foreground line-through")}>{i.title}</span>
                    <span className="text-xs text-muted-foreground">{CALENDAR_CATEGORIES[i.category as CalendarCategory]}</span>
                    <ResponsibilityBadge status={i.status === "DONE" ? "COMPLETED" : i.responsible_party} />
                    {i.report_status && <span className="text-xs text-muted-foreground">Report: {titleCase(i.report_status)}</span>}
                    {staff && !i.client_visibility && <span className="text-xs text-muted-foreground">(internal)</span>}
                  </div>
                  <p className={cn("text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>{overdue ? "Overdue · " : ""}{fmtDate(i.due_date)}{i.task_id ? " · task created" : ""}{i.notes_client ? ` · ${i.notes_client}` : ""}</p>
                </button>
                {staff && openId === i.id && <EditItem fundId={fundId} item={i} onSaved={refresh} />}
              </li>
            );
          })}</ul>
        </section>
      )) : <div className="rounded-xl border bg-card p-4 text-sm"><p className="font-medium">No upcoming deadlines</p><p className="text-muted-foreground">{staff ? "Build the schedule from this fund's services or add a date." : "No client-visible dates are scheduled yet."}</p></div>}
    </div>
  );
}

function NewItem({ fundId, onSaved }: { fundId: string; onSaved: () => void }) {
  const save = useServerFn(saveCalendarItem);
  const [v, setV] = useState({ title: "", category: "OTHER", due: "", party: "HARMONIOUS_HANDLING", visible: true, task: false });
  const submit = async () => {
    if (!v.title.trim() || !v.due) { toast.error("Add a title and due date."); return; }
    try { await save({ data: { fundId, title: v.title, category: v.category as any, dueDate: v.due, responsibleParty: v.party as any, clientVisible: v.visible, generateTask: v.task } }); toast.success("Date added."); setV({ ...v, title: "", due: "" }); onSaved(); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
      <Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="New calendar date" aria-label="Title" className="h-8 w-56" />
      <select aria-label="Category" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} className={sel}>{Object.entries(CALENDAR_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <Input type="date" value={v.due} onChange={(e) => setV({ ...v, due: e.target.value })} aria-label="Due date" className="h-8 w-40" />
      <select aria-label="Responsibility" value={v.party} onChange={(e) => setV({ ...v, party: e.target.value })} className={sel}>{RESPONSIBILITY_STATUSES.filter((s) => s !== "COMPLETED").map((s) => <option key={s} value={s}>{RESPONSIBILITY_LABEL[s]}</option>)}</select>
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={v.visible} onChange={(e) => setV({ ...v, visible: e.target.checked })} /> Client can see</label>
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={v.task} onChange={(e) => setV({ ...v, task: e.target.checked })} /> Create a task ahead</label>
      <Button size="sm" onClick={submit}>Add</Button>
    </div>
  );
}

function EditItem({ fundId, item, onSaved }: { fundId: string; item: any; onSaved: () => void }) {
  const save = useServerFn(saveCalendarItem); const hist = useServerFn(getCalendarItemHistory);
  const h = useQuery({ queryKey: ["fund-calendar-history", item.id], queryFn: () => hist({ data: { id: item.id } }) });
  const [v, setV] = useState({ due: item.due_date, party: item.responsible_party, visible: item.client_visibility, status: item.status, report: item.report_status ?? "", internal: item.notes_internal ?? "", client: item.notes_client ?? "", lead: item.task_lead_days, task: item.generate_task });
  const submit = async () => {
    try {
      await save({ data: { id: item.id, fundId, title: item.title, category: item.category, dueDate: v.due, responsibleParty: v.party, clientVisible: v.visible, status: v.status, reportStatus: (v.report || null) as any, notesInternal: v.internal || null, notesClient: v.client || null, taskLeadDays: Number(v.lead), generateTask: v.task } });
      toast.success("Saved."); onSaved(); h.refetch();
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div className="mt-2 space-y-2 rounded-md bg-muted/40 p-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <Input type="date" value={v.due} onChange={(e) => setV({ ...v, due: e.target.value })} aria-label="Due date" className="h-8 w-40" />
        <select aria-label="Responsibility" value={v.party} onChange={(e) => setV({ ...v, party: e.target.value })} className={sel}>{RESPONSIBILITY_STATUSES.map((s) => <option key={s} value={s}>{RESPONSIBILITY_LABEL[s]}</option>)}</select>
        <select aria-label="Status" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })} className={sel}>{["SCHEDULED", "IN_PROGRESS", "DONE", "CANCELLED"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select>
        {(item.category === "REPORTING" || item.category === "NAV") && <select aria-label="Report status" value={v.report} onChange={(e) => setV({ ...v, report: e.target.value })} className={sel}><option value="">No report status</option>{REPORT.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select>}
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={v.visible} onChange={(e) => setV({ ...v, visible: e.target.checked })} /> Client can see</label>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={v.task} onChange={(e) => setV({ ...v, task: e.target.checked })} /> Task</label>
        <Input type="number" min={0} max={120} value={v.lead} onChange={(e) => setV({ ...v, lead: e.target.value })} aria-label="Task lead days" className="h-8 w-20" />
        <span className="self-center text-xs text-muted-foreground">days ahead</span>
      </div>
      <Input value={v.internal} onChange={(e) => setV({ ...v, internal: e.target.value })} placeholder="Internal note (staff only)" aria-label="Internal note" className="h-8" />
      <Input value={v.client} onChange={(e) => setV({ ...v, client: e.target.value })} placeholder="Client-visible note" aria-label="Client note" className="h-8" />
      <Button size="sm" onClick={submit}>Save</Button>
      <ul className="space-y-0.5 text-xs text-muted-foreground">{(h.data ?? []).map((e: any) => <li key={e.id}>{new Date(e.created_at).toLocaleString()} · {e.kind}{Object.keys(e.detail ?? {}).length ? ` · ${Object.keys(e.detail).join(", ")}` : ""}</li>)}</ul>
    </div>
  );
}

function Rules({ fundId, rules, onSaved }: { fundId: string; rules: any[]; onSaved: () => void }) {
  const save = useServerFn(saveCalendarRule);
  if (!rules.length) return <p className="text-sm text-muted-foreground">No recurring rules yet. "Build schedule from services" adds them from this fund's entitlements.</p>;
  return (
    <div className="rounded-xl border bg-card p-3">
      <ul className="divide-y text-sm">{rules.map((r) => <RuleRow key={r.id} r={r} onSave={async (p) => { try { await save({ data: { id: r.id, fundId, ...p } }); toast.success("Rule saved. Future dates use it next time the schedule is built."); onSaved(); } catch (e) { toast.error((e as Error).message); } }} />)}</ul>
    </div>
  );
}

function RuleRow({ r, onSave }: { r: any; onSave: (p: any) => void }) {
  const [v, setV] = useState({ cadence: r.cadence, offset: r.due_day_offset, month: r.annual_month ?? 3, day: r.annual_day ?? 15, task: r.generate_task, lead: r.task_lead_days, active: r.active, visible: r.client_visibility });
  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <span className="min-w-40 flex-1 font-medium">{r.title}<span className="ml-1 text-xs text-muted-foreground">{r.feature_key ? `· from ${titleCase(r.feature_key)}` : ""}</span></span>
      <select aria-label="Cadence" value={v.cadence} onChange={(e) => setV({ ...v, cadence: e.target.value })} className={sel}>{["MONTHLY", "QUARTERLY", "ANNUAL"].map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</select>
      {v.cadence === "ANNUAL" ? (<>
        <Input type="number" min={1} max={12} value={v.month} onChange={(e) => setV({ ...v, month: e.target.value })} aria-label="Month" className="h-8 w-16" />
        <Input type="number" min={1} max={31} value={v.day} onChange={(e) => setV({ ...v, day: e.target.value })} aria-label="Day" className="h-8 w-16" />
      </>) : <><Input type="number" min={0} max={365} value={v.offset} onChange={(e) => setV({ ...v, offset: e.target.value })} aria-label="Days after period end" className="h-8 w-20" /><span className="text-xs text-muted-foreground">days after period end</span></>}
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={v.task} onChange={(e) => setV({ ...v, task: e.target.checked })} /> Task</label>
      <Input type="number" min={0} max={120} value={v.lead} onChange={(e) => setV({ ...v, lead: e.target.value })} aria-label="Lead days" className="h-8 w-16" />
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={v.visible} onChange={(e) => setV({ ...v, visible: e.target.checked })} /> Client</label>
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Active</label>
      <Button size="sm" variant="outline" onClick={() => onSave({ cadence: v.cadence, dueDayOffset: Number(v.offset), annualMonth: v.cadence === "ANNUAL" ? Number(v.month) : null, annualDay: v.cadence === "ANNUAL" ? Number(v.day) : null, generateTask: v.task, taskLeadDays: Number(v.lead), active: v.active, clientVisible: v.visible })}>Save</Button>
    </li>
  );
}
