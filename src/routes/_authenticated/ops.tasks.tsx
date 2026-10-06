import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getTasks, createTask, updateTask, getTaskHistory } from "@/lib/staff-tasks.functions";
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
type Tab = "mine" | "created" | "unassigned" | "all" | "done";

function TasksPage() {
  const load = useServerFn(getTasks);
  const q = useQuery({ queryKey: ["staff-tasks"], queryFn: () => load(), retry: false });
  const [tab, setTab] = useState<Tab>("mine");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const d = q.data;
  const rows = useMemo(() => {
    if (!d) return [];
    const s = search.toLowerCase();
    return d.rows.filter((t: any) => {
      const closed = t.status === "done" || t.status === "cancelled";
      if (tab === "done" ? !closed : closed) return false;
      if (tab === "mine" && t.assignee_user_id !== d.viewer) return false;
      if (tab === "created" && t.created_by !== d.viewer) return false;
      if (tab === "unassigned" && t.assignee_user_id) return false;
      return !s || `${t.title} ${t.description ?? ""} ${t.assigneeName ?? ""} ${t.clientName ?? ""}`.toLowerCase().includes(s);
    });
  }, [d, tab, search]);
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
    if (!title.trim()) return toast.error("Give the task a title.");
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
  const overdue = t.due_date && t.due_date < new Date().toISOString().slice(0, 10) && !["done", "cancelled"].includes(t.status);
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
          <div className="truncate font-medium text-foreground">{t.title}</div>
          <div className="text-xs text-muted-foreground">
            {t.assigneeName ?? "Unassigned"}{t.team ? ` · ${TEAMS[t.team] ?? t.team}` : ""}{t.clientName ? ` · ${t.clientName}` : ""}{t.source === "hubspot" ? " · from HubSpot" : ""}
            {t.due_date ? ` · due ${new Date(t.due_date + "T00:00:00").toLocaleDateString()}` : ""}
          </div>
        </button>
        {overdue && <Badge variant="destructive">Overdue</Badge>}
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
          {t.description && <p className="whitespace-pre-wrap text-foreground">{t.description}</p>}
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
                <li key={e.id} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{e.who}</span> {e.kind === "comment" ? `: ${e.detail.text}` : e.kind === "created" ? "created this task" : `changed ${Object.keys(e.detail).join(", ")}`} · {new Date(e.at).toLocaleString()}</li>
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
