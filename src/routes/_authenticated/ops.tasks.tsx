import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getTasks, createTask, updateTask, getTaskHistory, setTaskResponsibility } from "@/lib/staff-tasks.functions";
import { ResponsibilityBadge, ResponsibilityFilter } from "@/components/responsibility-badge";
import { RESPONSIBILITY_LABEL, RESPONSIBILITY_STATUSES, THIRD_PARTY_TYPES, asResponsibility, daysOverdue, responsibilityCounts, waitingOnDetail, type ResponsibilityStatus } from "@/lib/responsibility";
import { SERVICE_LEVEL_LABEL } from "@/lib/service-engagement-labels";
import { AmPage } from "@/components/account-management-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/ops/tasks")({
  head: () => ({ meta: [
    { title: "Tasks - Harmonious" },
    { name: "description", content: "Assign and track tasks for each Harmonious team member." },
    { property: "og:title", content: "Tasks - Harmonious" },
    { property: "og:description", content: "Team task tickets with owners, due dates and history." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: TasksPage,
});

const STATUS: Record<string, string> = { open: "Open", in_progress: "In progress", blocked: "Blocked", done: "Done", cancelled: "Cancelled" };
const PRIORITY: Record<string, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
const TEAMS: Record<string, string> = { operations: "Operations", finance: "Accounting & Finance", compliance: "Compliance", marketing: "Marketing", sales: "Sales" };
const UNASSIGNED = "__none";
const ALL = "__all";

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-44" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value={ALL}>{`Any ${label.toLowerCase()}`}</SelectItem>{options.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
    </Select>
  );
}
type Tab = "mine" | "created" | "unassigned" | "all" | "done";

function TasksPage() {
  const load = useServerFn(getTasks);
  const q = useQuery({ queryKey: ["staff-tasks"], queryFn: () => load(), retry: false });
  const [tab, setTab] = useState<Tab>("mine");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [resp, setResp] = useState<ResponsibilityStatus | "ALL">("ALL");
  const [f, setF] = useState({ fund: ALL, level: ALL, admin: ALL, lead: ALL, team: ALL, due: ALL });
  const d = q.data;
  const nameOf = (id: string | null) => d?.staff.find((x: any) => x.id === id)?.name ?? "Staff member";
  const opt = (key: string) => [...new Set((d?.rows ?? []).map((t: any) => t[key]).filter(Boolean))] as string[];
  const rows = useMemo(() => {
    if (!d) return [];
    const s = search.toLowerCase();
    return d.rows.filter((t: any) => {
      const closed = t.status === "done" || t.status === "cancelled";
      if (tab === "done" ? !closed : closed) return false;
      if (tab === "mine" && t.assignee_user_id !== d.viewer) return false;
      if (tab === "created" && t.created_by !== d.viewer) return false;
      if (tab === "unassigned" && t.assignee_user_id) return false;
      if (resp !== "ALL" && asResponsibility(t.responsibility_status) !== resp) return false;
      if (f.fund !== ALL && t.offering_id !== f.fund) return false;
      if (f.level !== ALL && t.serviceLevel !== f.level) return false;
      if (f.admin !== ALL && t.primaryAdministratorId !== f.admin) return false;
      if (f.lead !== ALL && t.relationshipLeadId !== f.lead) return false;
      if (f.team !== ALL && t.team !== f.team) return false;
      if (f.due === "overdue" && !daysOverdue(t)) return false;
      if (f.due === "week" && !(t.due_date && t.due_date <= new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10))) return false;
      if (f.due === "none" && t.due_date) return false;
      return !s || `${t.title} ${t.fundName ?? ""} ${t.waiting_on_name ?? ""} ${t.investorName ?? ""} ${t.description ?? ""} ${t.assigneeName ?? ""} ${t.clientName ?? ""}`.toLowerCase().includes(s);
    });
  }, [d, tab, search, resp, f]);
  const counts = useMemo(() => responsibilityCounts((d?.rows ?? []).filter((t: any) => tab === "done" || !["done", "cancelled"].includes(t.status))), [d, tab]);
  const count = (f: (t: any) => boolean) => d?.rows.filter((t: any) => !["done", "cancelled"].includes(t.status) && f(t)).length ?? 0;

  return (
    <AmPage title="Tasks" intro="Create a task, assign it to anyone on the team, and track it to done. Every change is kept in the task's history.">
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {d && (<>
        {d.canWrite && <NewTask staff={d.staff} />}
        <div className="flex flex-wrap items-center gap-2">
          {([["mine", `Assigned to me (${count((t) => t.assignee_user_id === d.viewer)})`], ["created", `I created (${count((t) => t.created_by === d.viewer)})`], ["unassigned", `Unassigned (${count((t) => !t.assignee_user_id)})`], ["all", `All open (${count(() => true)})`], ["done", "Done"]] as const).map(([k, l]) => (
            <Button key={k} size="sm" variant={tab === k ? "default" : "outline"} onClick={() => setTab(k)}>{l}</Button>
          ))}
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" className="ml-auto max-w-xs" />
        </div>
        <ResponsibilityFilter value={resp} onChange={setResp} counts={counts} />
        <div className="flex flex-wrap gap-2">
          <FilterSelect label="Fund" value={f.fund} onChange={(v) => setF({ ...f, fund: v })} options={opt("offering_id").map((id) => [id, d.rows.find((t: any) => t.offering_id === id)?.fundName ?? "Fund"])} />
          <FilterSelect label="Service level" value={f.level} onChange={(v) => setF({ ...f, level: v })} options={opt("serviceLevel").map((l) => [l, (SERVICE_LEVEL_LABEL as any)[l] ?? l])} />
          <FilterSelect label="Primary administrator" value={f.admin} onChange={(v) => setF({ ...f, admin: v })} options={opt("primaryAdministratorId").map((id) => [id, nameOf(id)])} />
          <FilterSelect label="Relationship lead" value={f.lead} onChange={(v) => setF({ ...f, lead: v })} options={opt("relationshipLeadId").map((id) => [id, nameOf(id)])} />
          <FilterSelect label="Team" value={f.team} onChange={(v) => setF({ ...f, team: v })} options={Object.entries(TEAMS)} />
          <FilterSelect label="Due date" value={f.due} onChange={(v) => setF({ ...f, due: v })} options={[["overdue", "Overdue"], ["week", "Due within 7 days"], ["none", "No due date"]]} />
        </div>
        <div className="rounded-lg border bg-card">
          {rows.length ? rows.map((t: any) => (
            <TaskRow key={t.id} t={t} staff={d.staff} canWrite={d.canWrite} open={openId === t.id} onToggle={() => setOpenId(openId === t.id ? null : t.id)} />
          )) : <p className="p-4 text-sm text-muted-foreground">No tasks here.</p>}
        </div>
      </>)}
    </AmPage>
  );
}

function NewTask({ staff }: { staff: { id: string; name: string }[] }) {
  const create = useServerFn(createTask);
  const qc = useQueryClient();
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [assignee, setAssignee] = useState(UNASSIGNED); const [priority, setPriority] = useState("normal");
  const [team, setTeam] = useState("operations"); const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!title.trim()) { toast.error("Give the task a title."); return; }
    setBusy(true);
    try {
      await create({ data: { title, description: desc || null, priority: priority as any, team, assignee: assignee === UNASSIGNED ? null : assignee, dueDate: due || null } });
      toast.success("Task created."); setTitle(""); setDesc(""); setDue("");
      qc.invalidateQueries({ queryKey: ["staff-tasks"] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="space-y-2 rounded-lg border bg-card p-4">
      <h2 className="text-base font-semibold text-foreground">New task</h2>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" aria-label="Task title" />
      <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Details (optional)" aria-label="Task details" rows={2} />
      <div className="flex flex-wrap gap-2">
        <Select value={assignee} onValueChange={setAssignee}><SelectTrigger className="w-56" aria-label="Assign to"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={UNASSIGNED}>Unassigned</SelectItem>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
        <Select value={team} onValueChange={setTeam}><SelectTrigger className="w-48" aria-label="Team"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(TEAMS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
        <Select value={priority} onValueChange={setPriority}><SelectTrigger className="w-32" aria-label="Priority"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(PRIORITY).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className="w-44" />
        <Button onClick={submit} disabled={busy}>Create task</Button>
      </div>
    </section>
  );
}

function TaskRow({ t, staff, canWrite, open, onToggle }: { t: any; staff: { id: string; name: string }[]; canWrite: boolean; open: boolean; onToggle: () => void }) {
  const update = useServerFn(updateTask);
  const hist = useServerFn(getTaskHistory);
  const qc = useQueryClient();
  const h = useQuery({ queryKey: ["staff-task-history", t.id], queryFn: () => hist({ data: { id: t.id } }), enabled: open });
  const [note, setNote] = useState("");
  const overdueDays = daysOverdue(t);
  const waiting = waitingOnDetail(t, "internal", t.investorName);
  const save = async (patch: Record<string, unknown>) => {
    try {
      await update({ data: { id: t.id, ...patch } as any });
      qc.invalidateQueries({ queryKey: ["staff-tasks"] }); qc.invalidateQueries({ queryKey: ["staff-task-history", t.id] });
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div className="border-b p-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onToggle} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2"><span className="truncate font-medium text-foreground">{t.title}</span><ResponsibilityBadge status={t.responsibility_status} /></div>
          {waiting && <div className="text-xs text-foreground">{RESPONSIBILITY_LABEL[asResponsibility(t.responsibility_status)]}: {waiting}</div>}
          <div className="text-xs text-muted-foreground">
            {t.assigneeName ?? "Unassigned"}{t.team ? ` · ${TEAMS[t.team] ?? t.team}` : ""}{t.fundName ? ` · ${t.fundName}` : t.clientName ? ` · ${t.clientName}` : ""}{t.source === "hubspot" ? " · from HubSpot" : ""}
            {t.due_date ? ` · due ${new Date(t.due_date + "T00:00:00").toLocaleDateString()}` : ""}
          </div>
        </button>
        {overdueDays > 0 && <Badge variant="destructive">Overdue {overdueDays}d</Badge>}
        {(t.priority === "high" || t.priority === "urgent") && <Badge variant="destructive">{PRIORITY[t.priority]}</Badge>}
        {canWrite ? (<>
          <Select value={t.assignee_user_id ?? UNASSIGNED} onValueChange={(v) => save({ assignee: v === UNASSIGNED ? null : v })}>
            <SelectTrigger className="h-8 w-44" aria-label="Assignee"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={UNASSIGNED}>Unassigned</SelectItem>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={t.status} onValueChange={(v) => save({ status: v })}>
            <SelectTrigger className="h-8 w-36" aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </>) : <Badge variant="secondary">{STATUS[t.status]}</Badge>}
      </div>
      {open && (
        <div className="mt-3 space-y-3 rounded-md bg-muted/40 p-3 text-sm">
          <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
            {([["Fund", t.fundName ?? "—"], ["Status", STATUS[t.status]], ["Responsibility", RESPONSIBILITY_LABEL[asResponsibility(t.responsibility_status)] + (t.responsibility_manual ? " (set manually)" : "")],
              ["Owner", t.responsible_user_id ? staff.find((x) => x.id === t.responsible_user_id)?.name ?? "Staff member" : t.assigneeName ?? "Unassigned"],
              ["Due", t.due_date ?? "—"], ["SLA due", t.sla_due_date ?? "—"], ["Waiting on", waiting ?? "—"], ["Client can see", t.client_visibility ? "Yes" : "No (internal)"],
              ["Related workflow", t.related_workflow_type ?? "—"]] as const).map(([k, v]) => (
              <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="text-foreground">{v}</dd></div>
            ))}
          </dl>
          {t.responsibility_note_internal && <p className="text-xs text-foreground"><span className="font-medium">Internal note:</span> {t.responsibility_note_internal}</p>}
          {t.responsibility_note_client && <p className="text-xs text-foreground"><span className="font-medium">Client note:</span> {t.responsibility_note_client}</p>}
          {t.description && <p className="whitespace-pre-wrap text-foreground">{t.description}</p>}
          {canWrite && !["done", "cancelled"].includes(t.status) && <ResponsibilityEditor t={t} staff={staff} />}
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <Select value={t.priority} onValueChange={(v) => save({ priority: v })}><SelectTrigger className="h-8 w-32" aria-label="Priority"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PRIORITY).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
              <Input type="date" defaultValue={t.due_date ?? ""} onBlur={(e) => e.target.value !== (t.due_date ?? "") && save({ dueDate: e.target.value || null })} aria-label="Due date" className="h-8 w-44" />
            </div>
          )}
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">History</div>
            <ul className="space-y-1">
              {(h.data ?? []).map((e: any) => (
                <li key={e.id} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{e.who}</span> {e.kind === "comment" ? `: ${e.detail.text}` : e.kind === "created" ? "created this task" : e.kind === "responsibility" ? `changed responsibility from ${RESPONSIBILITY_LABEL[asResponsibility(e.detail.from)]} to ${RESPONSIBILITY_LABEL[asResponsibility(e.detail.to)]}${e.detail.reason ? ` — ${e.detail.reason}` : ""}` : `changed ${Object.keys(e.detail).join(", ")}`} · {new Date(e.at).toLocaleString()}</li>
              ))}
              {h.data && !h.data.length && <li className="text-xs text-muted-foreground">No history yet.</li>}
            </ul>
          </div>
          {canWrite && (
            <div className="flex gap-2">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a comment" aria-label="Comment" className="h-8" />
              <Button size="sm" variant="outline" onClick={async () => { if (note.trim()) { await save({ note }); setNote(""); } }}>Comment</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResponsibilityEditor({ t, staff }: { t: any; staff: { id: string; name: string }[] }) {
  const set = useServerFn(setTaskResponsibility);
  const qc = useQueryClient();
  const [v, setV] = useState({
    status: asResponsibility(t.responsibility_status) as string, owner: t.responsible_user_id ?? UNASSIGNED,
    type: t.waiting_on_type ?? UNASSIGNED, name: t.waiting_on_name ?? "", internal: t.responsibility_note_internal ?? "",
    client: t.responsibility_note_client ?? "", visible: !!t.client_visibility, sla: t.sla_due_date ?? "", reason: "",
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await set({ data: {
        id: t.id, status: v.status as any, reason: v.reason, responsibleUserId: v.owner === UNASSIGNED ? null : v.owner,
        waitingOnType: v.type === UNASSIGNED ? null : v.type, waitingOnName: v.name || null, noteInternal: v.internal || null,
        noteClient: v.client || null, clientVisible: v.visible, slaDueDate: v.sla || null,
      } });
      toast.success("Responsibility updated."); setV({ ...v, reason: "" });
      qc.invalidateQueries({ queryKey: ["staff-tasks"] }); qc.invalidateQueries({ queryKey: ["staff-task-history", t.id] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-md border bg-card p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Who is this waiting on?</div>
      <div className="flex flex-wrap gap-2">
        <Select value={v.status} onValueChange={(x) => setV({ ...v, status: x })}><SelectTrigger className="h-8 w-56" aria-label="Responsibility"><SelectValue /></SelectTrigger>
          <SelectContent>{RESPONSIBILITY_STATUSES.filter((x) => x !== "COMPLETED").map((x) => <SelectItem key={x} value={x}>{RESPONSIBILITY_LABEL[x]}</SelectItem>)}</SelectContent></Select>
        <Select value={v.owner} onValueChange={(x) => setV({ ...v, owner: x })}><SelectTrigger className="h-8 w-48" aria-label="Responsible person"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={UNASSIGNED}>No responsible person</SelectItem>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
        {v.status === "WAITING_ON_THIRD_PARTY" && (
          <Select value={v.type} onValueChange={(x) => setV({ ...v, type: x })}><SelectTrigger className="h-8 w-44" aria-label="Third-party type"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={UNASSIGNED}>Type not set</SelectItem>{Object.entries(THIRD_PARTY_TYPES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
        )}
        {(v.status === "WAITING_ON_THIRD_PARTY" || v.status === "WAITING_ON_INVESTOR") && (
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder={v.status === "WAITING_ON_INVESTOR" ? "Investor name (optional)" : "Name, e.g. Customers Bank (optional, internal)"} aria-label="Waiting on name" className="h-8 w-64" />
        )}
        <Input type="date" value={v.sla} onChange={(e) => setV({ ...v, sla: e.target.value })} aria-label="SLA due date" className="h-8 w-44" />
      </div>
      <Input value={v.internal} onChange={(e) => setV({ ...v, internal: e.target.value })} placeholder="Internal explanation (staff only)" aria-label="Internal explanation" className="h-8" />
      <Input value={v.client} onChange={(e) => setV({ ...v, client: e.target.value })} placeholder="Client-visible explanation (optional)" aria-label="Client-visible explanation" className="h-8" />
      <label className="flex items-center gap-2 text-xs text-foreground"><input type="checkbox" checked={v.visible} onChange={(e) => setV({ ...v, visible: e.target.checked })} /> Show this item to the fund manager</label>
      <div className="flex gap-2">
        <Input value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="Reason for change (required, kept in history)" aria-label="Reason for change" className="h-8" />
        <Button size="sm" onClick={save} disabled={busy || v.reason.trim().length < 5}>Save</Button>
      </div>
    </div>
  );
}
