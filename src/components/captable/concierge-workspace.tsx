import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  CONCIERGE_STAGES,
  addConciergeNote,
  assignConciergeCase,
  conciergeStageLabel,
  getConciergeCase,
  getConciergeQueue,
  raiseConciergeException,
  resolveConciergeException,
  sendForFounderReview,
  setConciergeStage,
} from "@/lib/captable-concierge.functions";
import { importCapMigration } from "@/lib/captable-migration.functions";
import { MigrationWizard } from "./migration-wizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const dateFmt = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("en-US", { dateStyle: "medium" }) : "—";
const numFmt = (value: number) => Number(value ?? 0).toLocaleString("en-US");

export function ConciergeWorkspace() {
  const [caseId, setCaseId] = useState<string | null>(null);
  return caseId ? (
    <CaseDetail caseId={caseId} onBack={() => setCaseId(null)} />
  ) : (
    <Queue onOpen={setCaseId} />
  );
}

/* ----------------------------------------------------------------- the queue */

function Queue({ onOpen }: { onOpen: (id: string) => void }) {
  const load = useServerFn(getConciergeQueue);
  const { data, isLoading, error } = useQuery({
    queryKey: ["cap-concierge-queue"],
    queryFn: () => load(),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading the queue…</p>;
  if (error) {
    return (
      <Card role="alert" className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">We could not load the concierge queue</CardTitle>
          <CardDescription>
            {error instanceof Error ? error.message : "Please try again in a moment."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const cases = data?.cases ?? [];
  const mine = cases.filter((c) => c.assignedTo === data?.userId && c.stage !== "recorded");
  const unassigned = cases.filter((c) => !c.assignedTo && c.stage !== "recorded");
  const waiting = cases.filter((c) => c.stage === "awaiting_founder" || c.stage === "founder_review");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Migration concierge</h2>
        <p className="text-sm text-muted-foreground">
          Cap table files founders have handed to us. Prepare the batch, ask the founder anything
          unclear, then put the finished cap table in front of them. Nothing is recorded until they
          approve it.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tally label="Open cases" value={numFmt(cases.filter((c) => c.stage !== "recorded").length)} />
        <Tally label="Unassigned" value={numFmt(unassigned.length)} />
        <Tally label="Assigned to me" value={numFmt(mine.length)} />
        <Tally label="With the founder" value={numFmt(waiting.length)} />
      </div>

      {cases.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nothing in the queue</CardTitle>
            <CardDescription>
              Cases appear here as soon as a founder asks us to prepare their cap table file.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Specialist</TableHead>
                  <TableHead>Questions</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.companyName}
                      {row.priority === "urgent" ? (
                        <Badge variant="outline" className="ml-2">
                          Time sensitive
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.fileName ?? "Uploaded file"} · {row.provider} · {numFmt(row.rowCount)} lines
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{conciergeStageLabel(row.stage)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{row.specialist ?? "Unassigned"}</TableCell>
                    <TableCell className="text-sm">
                      {row.openQuestions ? `${row.openQuestions} open` : "—"}
                      {row.answeredQuestions ? ` · ${row.answeredQuestions} answered` : ""}
                    </TableCell>
                    <TableCell className="text-sm">{dateFmt(row.targetDate)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => onOpen(row.id)}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- one case */

function CaseDetail({ caseId, onBack }: { caseId: string; onBack: () => void }) {
  const load = useServerFn(getConciergeCase);
  const assign = useServerFn(assignConciergeCase);
  const stage = useServerFn(setConciergeStage);
  const raise = useServerFn(raiseConciergeException);
  const resolve = useServerFn(resolveConciergeException);
  const note = useServerFn(addConciergeNote);
  const send = useServerFn(sendForFounderReview);
  const record = useServerFn(importCapMigration);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["cap-concierge-case", caseId],
    queryFn: () => load({ data: { caseId } }),
    // The founder may be answering questions while the specialist works, so
    // keep the wizard honest without anyone reaching for refresh.
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const [question, setQuestion] = useState("");
  const [detail, setDetail] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [target, setTarget] = useState("");

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["cap-concierge-case", caseId] });
    void queryClient.invalidateQueries({ queryKey: ["cap-concierge-queue"] });
  };

  const run = <T,>(fn: unknown, success: string) =>
    useMutationLike<T>(fn as (input: unknown) => Promise<unknown>, success, refresh);

  const assigner = run(assign, "Case updated.");
  const stager = run(stage, "Stage updated.");
  const raiser = run(raise, "Question sent to the founder.");
  const resolver = run(resolve, "Question closed.");
  const noter = run(note, "Note saved.");
  const sender = run(send, "Sent to the founder for review.");
  const recorder = run(record, "Recorded onto the company's cap table.");

  const loaded = data as Awaited<ReturnType<typeof getConciergeCase>> | undefined;

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading the case…</p>;
  if (error || !loaded) {
    return (
      <Card role="alert" className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">We could not load this case</CardTitle>
          <CardDescription>
            {error instanceof Error ? error.message : "Please try again in a moment."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const kase = loaded.case;
  const mine = kase.assignedTo === loaded.userId;
  const approved = kase.reviewStatus === "approved";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-1">
            ← Back to the queue
          </Button>
          <h2 className="text-xl font-semibold tracking-tight">{loaded.company.name}</h2>
          <p className="text-sm text-muted-foreground">
            {loaded.migration.fileName ?? "Uploaded file"} · {loaded.migration.provider} ·{" "}
            {numFmt(loaded.counts.total)} lines · handed over {dateFmt(kase.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{conciergeStageLabel(kase.stage)}</Badge>
          {kase.specialist ? <Badge variant="outline">{kase.specialist}</Badge> : null}
          {mine ? (
            <Button size="sm" variant="outline" onClick={() => assigner.mutate({ caseId, unassign: true })}>
              Hand back
            </Button>
          ) : (
            <Button size="sm" onClick={() => assigner.mutate({ caseId, assignToMe: true })}>
              Assign to me
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tally label="Ready" value={numFmt(loaded.counts.ready)} />
        <Tally label="Need attention" value={numFmt(loaded.counts.error)} />
        <Tally label="Matched holders" value={numFmt(loaded.counts.matched)} />
        <Tally label="Shares in file" value={numFmt(loaded.counts.shares)} />
      </div>

      <MigrationWizard
        live
        title="Migration progress"
        description="Import, map, reconcile, then go live. This refreshes on its own as the founder and the file move along."
        facts={{
          total: loaded.counts.total,
          ready: loaded.counts.ready,
          error: loaded.counts.error,
          status: loaded.migration.status,
          reconciliation: loaded.migration.reconciliation,
          importedAt: loaded.migration.importedAt,
          openQuestions: loaded.exceptions.filter((e) => e.status === "open").length,
        }}
      />


      <Card>
        <CardHeader>
          <CardTitle className="text-base">Working the case</CardTitle>
          <CardDescription>
            Founder note: {kase.founderNote || "none given"}
            {kase.contactName ? ` · Contact: ${kase.contactName}` : ""}
            {kase.contactEmail ? ` (${kase.contactEmail})` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Select
                value={kase.stage}
                onValueChange={(value) => stager.mutate({ caseId, stage: value as never })}
              >
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONCIERGE_STAGES.filter((s) => s.key !== "recorded").map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="concierge-target">Target date</Label>
              <Input
                id="concierge-target"
                type="date"
                className="w-48"
                value={target || (kase.targetDate ?? "")}
                onChange={(event) => setTarget(event.target.value)}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => assigner.mutate({ caseId, targetDate: target || null })}
            >
              Save target
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              onClick={() => sender.mutate({ caseId })}
              disabled={kase.stage === "recorded" || loaded.counts.ready === 0}
            >
              Send for founder review
            </Button>
            <Button
              variant={approved ? "default" : "outline"}
              disabled={!approved || Boolean(kase.recordedAt)}
              onClick={() => recorder.mutate({ migrationId: kase.migrationId })}
            >
              Record onto the cap table
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {kase.recordedAt
              ? `Recorded ${dateFmt(kase.recordedAt)}.`
              : approved
                ? `Founder approved ${dateFmt(kase.reviewedAt)}. You can record it now.`
                : kase.reviewStatus === "changes_requested"
                  ? `Founder sent it back${kase.reviewNote ? `: “${kase.reviewNote}”` : ""}.`
                  : "The founder must approve the prepared batch before anything can be recorded."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Questions for the founder</CardTitle>
          <CardDescription>
            Anything you cannot resolve from the file itself. The founder sees these in their portal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-lg border p-3">
            <div className="space-y-1.5">
              <Label htmlFor="concierge-question">Question</Label>
              <Input
                id="concierge-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Is the 12,000 share line a grant or a purchase?"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="concierge-detail">Context (optional)</Label>
              <Textarea
                id="concierge-detail"
                value={detail}
                onChange={(event) => setDetail(event.target.value)}
              />
            </div>
            <Button
              size="sm"
              disabled={!question.trim()}
              onClick={() => {
                raiser.mutate({ caseId, question: question.trim(), detail: detail.trim() || null });
                setQuestion("");
                setDetail("");
              }}
            >
              Send question
            </Button>
          </div>

          {loaded.exceptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No questions raised yet.</p>
          ) : (
            <ul className="space-y-2">
              {loaded.exceptions.map((item) => (
                <li key={item.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{item.question}</p>
                    <Badge variant={item.status === "resolved" ? "secondary" : "outline"}>
                      {item.status === "open"
                        ? "Waiting on founder"
                        : item.status === "answered"
                          ? "Answered"
                          : "Resolved"}
                    </Badge>
                  </div>
                  {item.detail ? <p className="text-muted-foreground">{item.detail}</p> : null}
                  {item.response ? (
                    <p className="mt-1">
                      <span className="text-muted-foreground">Founder: </span>
                      {item.response}
                    </p>
                  ) : null}
                  {item.status !== "resolved" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => resolver.mutate({ exceptionId: item.id })}
                    >
                      Close this question
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Internal notes</CardTitle>
          <CardDescription>Only Harmonious staff can see these.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={noteBody}
            onChange={(event) => setNoteBody(event.target.value)}
            placeholder="What you checked, what you changed, who you spoke to."
          />
          <Button
            size="sm"
            disabled={!noteBody.trim()}
            onClick={() => {
              noter.mutate({ caseId, body: noteBody.trim() });
              setNoteBody("");
            }}
          >
            Save note
          </Button>
          <ul className="space-y-2">
            {loaded.notes.map((item) => (
              <li key={item.id} className="rounded-lg border p-3 text-sm">
                <p>{item.body}</p>
                <p className="text-xs text-muted-foreground">
                  {item.author} · {dateFmt(item.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prepared lines</CardTitle>
          <CardDescription>The first 100 lines of the batch as they stand today.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Shareholder</TableHead>
                <TableHead>Security</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loaded.rows.slice(0, 100).map((row) => {
                const mapped = row.mapped as Record<string, unknown>;
                const match = loaded.stakeholders.find((s) => s.id === row.matchStakeholderId);
                return (
                  <TableRow key={row.id}>
                    <TableCell>{row.rowNumber}</TableCell>
                    <TableCell>{String(mapped['holderName'] ?? "—")}</TableCell>
                    <TableCell>{String(mapped['securityClass'] ?? mapped['securityType'] ?? "—")}</TableCell>
                    <TableCell className="text-right">{numFmt(Number(mapped['quantity'] ?? 0))}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {match ? match.name : "New shareholder"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === "error" ? "destructive" : "outline"} className="capitalize">
                        {row.status}
                      </Badge>
                      {row.issues.length ? (
                        <p className="mt-1 text-xs text-muted-foreground">{row.issues.join(", ")}</p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Tally({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

/** One shared mutation shape: run it, tell the user, refresh the case. */
function useMutationLike<T>(
  fn: (input: unknown) => Promise<unknown>,
  success: string,
  refresh: () => void,
) {
  return useMutation({
    mutationFn: (input: T) => fn({ data: input } as never),
    onSuccess: () => {
      toast.success(success);
      refresh();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "That did not go through."),
  });
}
