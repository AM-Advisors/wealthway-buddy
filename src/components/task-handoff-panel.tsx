import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchablePeoplePicker } from "@/components/ui/searchable-people-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { transitionTask } from "@/lib/staff-tasks.functions";

type Mode = null | "handoff" | "block" | "next" | "complete" | "missing";

/** Accountable owner, handoff acceptance, blockers and completion for one staff task. */
export function TaskHandoffPanel({ t, viewer, staff }: { t: any; viewer: string; staff: { id: string; name: string }[] }) {
  const run = useServerFn(transitionTask);
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>(null);
  const [v, setV] = useState({ to: "", nextAction: t.next_action ?? "", targetDate: t.due_date ?? "", followUp: t.follow_up_date ?? "", text: "", note: "", ref: "" });
  const [busy, setBusy] = useState(false);
  const owner = t.assignee_user_id ?? t.created_by;
  const isOwner = owner === viewer;
  const isReceiver = t.handoff_to_user_id === viewer;
  const closed = ["done", "cancelled"].includes(t.status);

  const go = async (action: string, payload: Record<string, unknown> = {}, ok = "Saved.") => {
    setBusy(true);
    try {
      const clean = Object.fromEntries(Object.entries(payload).filter(([, x]) => x !== "" && x !== undefined));
      await run({ data: { id: t.id, action: action as any, payload: clean as any } });
      toast.success(ok); setMode(null);
      qc.invalidateQueries({ queryKey: ["staff-tasks"] }); qc.invalidateQueries({ queryKey: ["staff-task-history", t.id] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2 rounded-md border bg-card p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next step</div>
      {t.next_action && <p className="text-sm"><span className="font-medium">Next action:</span> {t.next_action}{t.follow_up_date ? ` · follow up ${t.follow_up_date}` : ""}</p>}
      {t.completion_note && <p className="text-sm"><span className="font-medium">Completed:</span> {t.completion_note}{t.completion_ref ? ` · ${t.completion_ref}` : ""}</p>}
      {t.handoff_to_user_id && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          Awaiting acceptance by <span className="font-medium">{t.handoffToName}</span>{t.handoffFromName ? ` (from ${t.handoffFromName})` : ""}.
          {t.handoff_issue && <span className="block text-destructive">Missing: {t.handoff_issue}</span>}
        </p>
      )}
      {!closed && (
        <div className="flex flex-wrap gap-2">
          {isReceiver && <Button size="sm" disabled={busy} onClick={() => go("accept_handoff", {}, "You now own this task.")}>Accept</Button>}
          {isReceiver && <Button size="sm" variant="outline" onClick={() => setMode("missing")}>Something's missing</Button>}
          {isOwner && !t.handoff_to_user_id && <Button size="sm" onClick={() => setMode("complete")}>Complete</Button>}
          {isOwner && !t.handoff_to_user_id && <Button size="sm" variant="outline" onClick={() => setMode("handoff")}>Hand off</Button>}
          {isOwner && t.handoff_to_user_id && <Button size="sm" variant="outline" disabled={busy} onClick={() => go("cancel_handoff", {}, "Handoff withdrawn.")}>Withdraw handoff</Button>}
          {isOwner && <Button size="sm" variant="outline" onClick={() => setMode("block")}>Blocked</Button>}
          {isOwner && <Button size="sm" variant="ghost" onClick={() => setMode("next")}>Update next step</Button>}
          {!isOwner && !isReceiver && <p className="text-xs text-muted-foreground">Only the accountable owner can change this task's next step.</p>}
        </div>
      )}
      {mode === "handoff" && (
        <div className="space-y-2">
          <SearchablePeoplePicker value={v.to} onValueChange={(x) => setV({ ...v, to: x })}>
            <SelectTrigger className="h-9 w-64" aria-label="Hand off to"><SelectValue placeholder="Hand off to…" /></SelectTrigger>
            <SelectContent>{staff.filter((s) => s.id !== viewer).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </SearchablePeoplePicker>
          <Input value={v.nextAction} onChange={(e) => setV({ ...v, nextAction: e.target.value })} placeholder="What should they do next?" aria-label="Next action" />
          <p className="text-xs text-muted-foreground">You stay the owner until they accept. No message is sent; it appears in their task list.</p>
          <Button size="sm" disabled={busy || !v.to} onClick={() => go("request_handoff", { to: v.to, nextAction: v.nextAction }, "Handoff sent for acceptance.")}>Send handoff</Button>
        </div>
      )}
      {mode === "missing" && (
        <div className="space-y-2">
          <Textarea value={v.text} onChange={(e) => setV({ ...v, text: e.target.value })} placeholder="What information or step is missing?" aria-label="What's missing" rows={2} />
          <Button size="sm" disabled={busy || !v.text.trim()} onClick={() => go("handoff_issue", { text: v.text }, "Sent back to the owner.")}>Send to owner</Button>
        </div>
      )}
      {(mode === "block" || mode === "next") && (
        <div className="space-y-2">
          <Input value={v.nextAction} onChange={(e) => setV({ ...v, nextAction: e.target.value })} placeholder="Next action (e.g. call the bank about the missing statement)" aria-label="Next action" />
          <div className="flex flex-wrap gap-2">
            {mode === "block" && <label className="text-xs">Target date<Input type="date" value={v.targetDate} onChange={(e) => setV({ ...v, targetDate: e.target.value })} className="h-9 w-44" /></label>}
            <label className="text-xs">Next follow-up<Input type="date" value={v.followUp} onChange={(e) => setV({ ...v, followUp: e.target.value })} className="h-9 w-44" /></label>
          </div>
          {mode === "block"
            ? <Button size="sm" disabled={busy || !v.nextAction.trim() || !v.targetDate || !v.followUp} onClick={() => go("block", { nextAction: v.nextAction, targetDate: v.targetDate, followUp: v.followUp }, "Marked blocked. You still own it.")}>Mark blocked</Button>
            : <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => go("set_next", { nextAction: v.nextAction, followUp: v.followUp })}>Save next step</Button>
                {t.status === "blocked" && <Button size="sm" variant="outline" disabled={busy} onClick={() => go("set_next", { nextAction: v.nextAction, followUp: v.followUp, unblock: true }, "Unblocked.")}>Save and unblock</Button>}
              </div>}
        </div>
      )}
      {mode === "complete" && (
        <div className="space-y-2">
          <Textarea value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="What was done? (required)" aria-label="Completion note" rows={2} />
          <Input value={v.ref} onChange={(e) => setV({ ...v, ref: e.target.value })} placeholder="Link or record reference (optional)" aria-label="Completion reference" />
          <Button size="sm" disabled={busy || !v.note.trim()} onClick={() => go("complete", { note: v.note, ref: v.ref }, "Task completed.")}>Complete task</Button>
        </div>
      )}
    </div>
  );
}
