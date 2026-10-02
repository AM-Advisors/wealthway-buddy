import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Circle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { updateSetupTaskFn } from "@/lib/fund-setup.functions";
import { fmtDate } from "./shared";

export type TodoStep = { id: string; label: string; description: string | null; status: string; dueDate: string | null; answer: string };

/**
 * Checklist of everything waiting on the manager. Items they already answered
 * show as checked ("Sent - Harmonious reviewing") so nobody is asked twice;
 * Harmonious still reviews each answer before the step is complete.
 */
export function TodosTab({ fundId, steps }: { fundId: string; steps: TodoStep[] }) {
  const open = steps.filter((s) => s.status !== "review" && !s.answer.trim());
  const answered = steps.filter((s) => s.status === "review" || s.answer.trim());
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">To dos</CardTitle>
        <CardDescription>
          {steps.length === 0 ? "Nothing is waiting on you right now." : `${open.length} of ${steps.length} still need your answer. Items you've already answered are checked off.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {open.map((s) => <TodoItem key={s.id} fundId={fundId} step={s} />)}
        {answered.map((s) => <TodoItem key={s.id} fundId={fundId} step={s} />)}
      </CardContent>
    </Card>
  );
}

function TodoItem({ fundId, step }: { fundId: string; step: TodoStep }) {
  const qc = useQueryClient();
  const save = useServerFn(updateSetupTaskFn);
  const done = step.status === "review" || !!step.answer.trim();
  const [expanded, setExpanded] = useState(!done);
  const [answer, setAnswer] = useState(step.answer);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (answer.trim().length < 2) { toast.error("Add your answer or note first."); return; }
    setBusy(true);
    try {
      await save({ data: { taskId: step.id, status: "review", response: { answer: answer.trim() } } });
      toast.success("Checked off and sent to Harmonious.");
      setExpanded(false);
      await qc.invalidateQueries({ queryKey: ["client-fund", fundId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't send this item.");
    } finally { setBusy(false); }
  };
  return (
    <div className="rounded-md border p-3">
      <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setExpanded((v) => !v)}>
        {done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" /> : <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
        <span className="flex-1">
          <span className={`block text-sm font-medium ${done ? "text-muted-foreground line-through" : ""}`}>{step.label}</span>
          {step.description && <span className="block text-xs text-muted-foreground">{step.description}</span>}
          {step.dueDate && <span className="block text-xs text-muted-foreground">Due {fmtDate(step.dueDate)}</span>}
        </span>
        <Badge variant={done ? "secondary" : "outline"}>{done ? "Sent - Harmonious reviewing" : "Waiting on you"}</Badge>
      </button>
      {expanded && (
        <div className="mt-3 space-y-2 pl-8">
          <Textarea rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer, details or a note for Harmonious" maxLength={4000} />
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={busy}>{busy ? "Sending…" : done ? "Update answer" : "Check off and send"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
