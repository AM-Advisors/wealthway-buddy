import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  CONCIERGE_STAGES,
  answerConciergeException,
  conciergeStageLabel,
  getMyConciergeCase,
  startConciergeCase,
  submitFounderReview,
} from "@/lib/captable-concierge.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { fmtDate, fmtNumber } from "./captable-context";

/** The founder hands the file over to Harmonious. */
export function ConciergeHandoverDialog({
  open,
  onOpenChange,
  migrationId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  migrationId: string;
  onDone: () => void;
}) {
  const start = useServerFn(startConciergeCase);
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [urgent, setUrgent] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      start({
        data: {
          migrationId,
          note: note || null,
          contactName: contactName || null,
          contactEmail: contactEmail || null,
          priority: urgent ? ("urgent" as const) : ("standard" as const),
        },
      }),
    onSuccess: () => {
      toast.success("Handed over. A specialist will pick this up and keep you posted.");
      void queryClient.invalidateQueries({ queryKey: ["cap-concierge", migrationId] });
      onOpenChange(false);
      onDone();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "We could not send that request."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Have Harmonious do it for me</DialogTitle>
          <DialogDescription>
            A named specialist prepares your cap table from this file, comes back to you with
            anything unclear, and shows you the finished result. Nothing is recorded until you
            approve it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="concierge-contact">Who should we speak to?</Label>
              <Input
                id="concierge-contact"
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="concierge-email">Their email</Label>
              <Input
                id="concierge-email"
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                placeholder="name@company.com"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="concierge-note">Anything we should know? (optional)</Label>
            <Textarea
              id="concierge-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="For example: the option grants are on a second tab, and two holders have since transferred."
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={urgent}
              onChange={(event) => setUrgent(event.target.checked)}
            />
            <span>This is time sensitive — we have a round or a closing coming up.</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Sending…" : "Hand it over"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The founder's live view of the work Harmonious is doing on their file. */
export function ConciergePanel({
  migrationId,
  onChanged,
}: {
  migrationId: string;
  onChanged: () => void;
}) {
  const load = useServerFn(getMyConciergeCase);
  const answer = useServerFn(answerConciergeException);
  const review = useServerFn(submitFounderReview);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["cap-concierge", migrationId],
    queryFn: () => load({ data: { migrationId } }),
  });

  const [responses, setResponses] = useState<Record<string, string>>({});
  const [reviewNote, setReviewNote] = useState("");

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["cap-concierge", migrationId] });
    onChanged();
  };

  const answerer = useMutation({
    mutationFn: (input: { exceptionId: string; response: string }) => answer({ data: input }),
    onSuccess: () => {
      toast.success("Thank you — sent to your specialist.");
      refresh();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "We could not send that answer."),
  });

  const reviewer = useMutation({
    mutationFn: (decision: "approved" | "changes_requested") =>
      review({ data: { caseId: data!.case!.id, decision, note: reviewNote || null } }),
    onSuccess: (_result, decision) => {
      toast.success(
        decision === "approved"
          ? "Approved. Your specialist will record it onto your cap table."
          : "Sent back with your comments.",
      );
      setReviewNote("");
      refresh();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "We could not send that decision."),
  });

  const kase = data?.case;
  if (!kase) return null;

  const summary = kase.preparedSummary ?? null;
  const openQuestions = (data?.exceptions ?? []).filter((e) => e.status === "open");
  const historicQuestions = (data?.exceptions ?? []).filter((e) => e.status !== "open");
  const stageIndex = CONCIERGE_STAGES.findIndex((s) => s.key === kase.stage);

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              Harmonious is preparing this file
              <Badge variant="secondary">{conciergeStageLabel(kase.stage)}</Badge>
              {kase.priority === "urgent" ? <Badge variant="outline">Time sensitive</Badge> : null}
            </CardTitle>
            <CardDescription>
              {kase.specialist ? `Your specialist is ${kase.specialist}.` : "Waiting to be picked up by a specialist."}
              {kase.targetDate ? ` Target date ${fmtDate(kase.targetDate)}.` : ""}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {CONCIERGE_STAGES.map((stage, index) => {
            const done = stageIndex > index || kase.stage === "recorded";
            const current = stage.key === kase.stage;
            return (
              <li
                key={stage.key}
                className={`rounded-lg border p-2 text-xs ${
                  current
                    ? "border-primary bg-background font-semibold"
                    : done
                      ? "border-primary/30 bg-background/60 text-muted-foreground"
                      : "border-dashed text-muted-foreground"
                }`}
              >
                {stage.label}
              </li>
            );
          })}
        </ol>

        {openQuestions.length ? (
          <div className="space-y-3 rounded-lg border bg-background p-3">
            <p className="text-sm font-medium">We need your answer</p>
            {openQuestions.map((question) => (
              <div key={question.id} className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">{question.question}</p>
                {question.detail ? (
                  <p className="text-sm text-muted-foreground">{question.detail}</p>
                ) : null}
                <Textarea
                  value={responses[question.id] ?? ""}
                  onChange={(event) =>
                    setResponses((prev) => ({ ...prev, [question.id]: event.target.value }))
                  }
                  placeholder="Your answer"
                />
                <Button
                  size="sm"
                  disabled={answerer.isPending || !(responses[question.id] ?? "").trim()}
                  onClick={() =>
                    answerer.mutate({
                      exceptionId: question.id,
                      response: (responses[question.id] ?? "").trim(),
                    })
                  }
                >
                  Send answer
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        {kase.stage === "founder_review" && kase.reviewStatus === "pending" ? (
          <div className="space-y-3 rounded-lg border bg-background p-3">
            <p className="text-sm font-medium">Ready for your review</p>
            {summary ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Lines prepared" value={fmtNumber(Number(summary['lines'] ?? 0))} />
                <Stat label="Shares" value={fmtNumber(Number(summary['shares'] ?? 0))} />
                <Stat label="Existing holders matched" value={fmtNumber(Number(summary['matched'] ?? 0))} />
                <Stat label="New shareholders" value={fmtNumber(Number(summary['newHolders'] ?? 0))} />
              </div>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Check the lines below. Approving lets your specialist record them onto your cap table.
            </p>
            <Textarea
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="Comments (required if you are sending it back)"
            />
            <div className="flex flex-wrap gap-2">
              <Button disabled={reviewer.isPending} onClick={() => reviewer.mutate("approved")}>
                Approve this cap table
              </Button>
              <Button
                variant="outline"
                disabled={reviewer.isPending}
                onClick={() => reviewer.mutate("changes_requested")}
              >
                Send back with changes
              </Button>
            </div>
          </div>
        ) : null}

        {kase.reviewStatus === "approved" && kase.stage !== "recorded" ? (
          <p className="text-sm text-muted-foreground">
            You approved this on {fmtDate(kase.reviewedAt)}. Your specialist is recording it now.
          </p>
        ) : null}
        {kase.reviewStatus === "changes_requested" ? (
          <p className="text-sm text-muted-foreground">
            Sent back on {fmtDate(kase.reviewedAt)}
            {kase.reviewNote ? ` — “${kase.reviewNote}”` : ""}. We are making those changes.
          </p>
        ) : null}
        {kase.recordedAt ? (
          <p className="text-sm text-muted-foreground">
            Recorded onto your cap table on {fmtDate(kase.recordedAt)}.
          </p>
        ) : null}

        {historicQuestions.length ? (
          <details className="rounded-lg border bg-background p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              Earlier questions ({historicQuestions.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {historicQuestions.map((question) => (
                <li key={question.id} className="rounded-md border p-2">
                  <p className="font-medium">{question.question}</p>
                  {question.response ? (
                    <p className="text-muted-foreground">Your answer: {question.response}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {question.status === "resolved" ? "Resolved" : "Answered"} ·{" "}
                    {fmtDate(question.respondedAt ?? question.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
