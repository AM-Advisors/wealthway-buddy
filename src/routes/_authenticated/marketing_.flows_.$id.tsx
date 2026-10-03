import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/sales/sales-ui";
import { MkPage, mkHead, fmt } from "@/components/marketing-ui";
import { getFlow, saveFlow, setFlowStatus } from "@/lib/email-flows.functions";
import { SALES_STAGES, STAGE_LABEL } from "@/lib/sales-model";

export const TRIGGER_LABEL: Record<string, string> = {
  manual: "Added by hand", stage_change: "Sales stage change", client_signed: "New client signed", email_click: "Clicked an email but didn't reply",
};
const STOP = ["meeting_set", "contract_won", "contract_lost"];

export const Route = createFileRoute("/_authenticated/marketing_/flows_/$id")({
  head: mkHead("Edit flow", "Build the steps and starting rule for an email follow-up flow."),
  component: FlowEditor,
});

type Step = { delayDays: number; subject: string; body: string };

function FlowEditor() {
  const { id } = Route.useParams();
  const isNew = id === "new";
  const nav = useNavigate();
  const qc = useQueryClient();
  const load = useServerFn(getFlow), save = useServerFn(saveFlow), status = useServerFn(setFlowStatus);
  const q = useQuery({ queryKey: ["flow", id], queryFn: () => load({ data: { id } }), enabled: !isNew, retry: false });
  const [name, setName] = useState(""), [desc, setDesc] = useState(""), [audience, setAudience] = useState("any");
  const [trigger, setTrigger] = useState("manual"), [stage, setStage] = useState("meeting_held");
  const [steps, setSteps] = useState<Step[]>([{ delayDays: 0, subject: "", body: "Hi {{first_name}},\n\n" }]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const f: any = q.data?.flow; if (!f) return;
    setName(f.name); setDesc(f.description ?? ""); setAudience(f.audience); setTrigger(f.trigger_kind); setStage(f.trigger_stage ?? "meeting_held");
    setSteps((q.data!.steps as any[]).map((s) => ({ delayDays: s.delay_days, subject: s.subject, body: s.body })));
  }, [q.data]);
  const canEdit = isNew || q.data?.canEdit;
  const upd = (i: number, p: Partial<Step>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function onSave() {
    setBusy(true);
    try {
      const r = await save({ data: { id: isNew ? null : id, name, description: desc || null, audience: audience as never, triggerKind: trigger as never, triggerStage: trigger === "stage_change" ? stage : null, steps } });
      toast.success("Flow saved");
      qc.invalidateQueries({ queryKey: ["flows"] });
      if (isNew) nav({ to: "/marketing/flows/$id", params: { id: r.id as string } }); else q.refetch();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function onStatus(s: "active" | "paused" | "archived") {
    try { await status({ data: { id, status: s } }); toast.success(s === "active" ? "Flow turned on" : s === "paused" ? "Flow paused" : "Flow archived"); if (s === "archived") nav({ to: "/marketing/flows" }); else q.refetch(); }
    catch (e) { toast.error((e as Error).message); }
  }
  const f: any = q.data?.flow;
  let day = 0;
  return (
    <MkPage title={isNew ? "New flow" : name || "Flow"} intro="Use {{first_name}}, {{name}}, {{company}} and {{rep_name}} to personalize. Emails go out only when the rep clicks Send, and always include an unsubscribe link."
      actions={!isNew && f && canEdit ? <div className="flex gap-2">
        {f.status !== "active" ? <Button onClick={() => onStatus("active")}>Turn on</Button> : <Button variant="outline" onClick={() => onStatus("paused")}>Pause</Button>}
        <Button variant="outline" onClick={() => onStatus("archived")}>Archive</Button></div> : undefined}>
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      <Panel title="Setup" action={f ? <Badge variant={f.status === "active" ? "default" : "secondary"}>{f.status === "active" ? "On" : f.status === "paused" ? "Paused" : "Draft"}</Badge> : undefined}>
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} /></div>
          <div><Label>Who it's for</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={audience} onChange={(e) => setAudience(e.target.value)} disabled={!canEdit}>
              <option value="any">Prospects and clients</option><option value="prospect">Prospects only</option><option value="client">Clients only</option></select></div>
          <div><Label>Starts when</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={trigger} onChange={(e) => setTrigger(e.target.value)} disabled={!canEdit}>
              {Object.entries(TRIGGER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          {trigger === "stage_change" && <div><Label>Sales stage</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={stage} onChange={(e) => setStage(e.target.value)} disabled={!canEdit}>
              {SALES_STAGES.filter((s) => !STOP.includes(s)).map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select></div>}
          <div className="md:col-span-2"><Label>Notes</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!canEdit} /></div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">A contact leaves the flow automatically when they reply, unsubscribe, book a meeting, or their deal is won or lost.</p>
      </Panel>
      <Panel title="Steps" action={canEdit ? <Button size="sm" variant="outline" onClick={() => setSteps((s) => [...s, { delayDays: 3, subject: "", body: "Hi {{first_name}},\n\n" }])}>Add step</Button> : undefined}>
        <ol className="space-y-4">{steps.map((s, i) => { day += s.delayDays; return (
          <li key={i} className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">Step {i + 1} · day {day}</span>
              <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Wait</span>
                <Input type="number" min={0} max={365} className="h-8 w-20" value={s.delayDays} onChange={(e) => upd(i, { delayDays: Number(e.target.value) || 0 })} disabled={!canEdit} />
                <span className="text-muted-foreground">days {i === 0 ? "after joining" : "after the last send"}</span>
                {canEdit && steps.length > 1 && <Button size="sm" variant="ghost" onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}>Remove</Button>}</div>
            </div>
            <Input placeholder="Subject" value={s.subject} onChange={(e) => upd(i, { subject: e.target.value })} disabled={!canEdit} />
            <Textarea rows={5} value={s.body} onChange={(e) => upd(i, { body: e.target.value })} disabled={!canEdit} />
          </li>); })}</ol>
        {canEdit && <Button className="mt-4" onClick={onSave} disabled={busy}>{busy ? "Saving…" : "Save flow"}</Button>}
      </Panel>
      {!isNew && q.data && <Panel title="People in this flow">
        {q.data.enrollments.length === 0 ? <p className="text-sm text-muted-foreground">Nobody yet. Reps add contacts from Sales → Follow-ups.</p> : (
          <ul className="divide-y text-sm">{(q.data.enrollments as any[]).map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span>{e.contact?.full_name ?? "Contact"} <span className="text-muted-foreground">{e.contact?.organization ?? ""}</span></span>
              <span className="text-muted-foreground">{e.status === "active" ? `Step ${e.next_step} due ${fmt(e.next_due_at)}` : e.status === "completed" ? "Finished" : `Stopped: ${e.stop_reason}`} · {TRIGGER_LABEL[e.enrolled_via] ?? e.enrolled_via}</span>
            </li>))}</ul>
        )}
      </Panel>}
    </MkPage>
  );
}
