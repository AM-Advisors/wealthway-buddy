import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  answerQuestion,
  assignQuestion,
  getMyQuestions,
  getQuestionBoard,
  questionStatusLabel,
  removeQuestion,
  replyToAnswer,
  saveQuestion,
  setQuestionStatus,
  unassignQuestion,
} from "@/lib/diligence-questions.functions";

function when(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(status: string) {
  if (status === "accepted") return "default" as const;
  if (status === "needs_followup") return "destructive" as const;
  if (status === "answered") return "secondary" as const;
  return "outline" as const;
}

function AnswerTrail({ answers }: { answers: any[] }) {
  if (!answers.length) {
    return <p className="text-xs text-muted-foreground">No answers yet.</p>;
  }
  return (
    <ol className="space-y-2 border-l pl-4">
      {answers.map((a) => (
        <li key={a.id} className="text-sm">
          <div className="text-xs text-muted-foreground">
            {a.from_reviewer ? "Fund team" : (a.author_name ?? "Investor")} · {when(a.created_at)}
          </div>
          <p className="whitespace-pre-wrap">{a.body}</p>
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------- manager view ---------------------------- */

function ManagerBoard({ offeringId }: { offeringId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getQuestionBoard);
  const create = useServerFn(saveQuestion);
  const drop = useServerFn(removeQuestion);
  const assign = useServerFn(assignQuestion);
  const unassign = useServerFn(unassignQuestion);
  const review = useServerFn(setQuestionStatus);
  const reply = useServerFn(replyToAnswer);

  const board = useQuery({
    queryKey: ["diligence-question-board", offeringId],
    queryFn: () => load({ data: { offering_id: offeringId } }),
  });

  const [prompt, setPrompt] = useState("");
  const [guidance, setGuidance] = useState("");
  const [category, setCategory] = useState("general");
  const [openTrail, setOpenTrail] = useState<Record<string, boolean>>({});
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [dueDate, setDueDate] = useState<Record<string, string>>({});

  const refresh = () => qc.invalidateQueries({ queryKey: ["diligence-question-board", offeringId] });

  const addQuestion = useMutation({
    mutationFn: () =>
      create({
        data: {
          offering_id: offeringId,
          prompt,
          guidance: guidance || undefined,
          category,
          is_required: true,
          sort_order: (board.data?.questions.length ?? 0) + 1,
        },
      }),
    onSuccess: () => {
      setPrompt("");
      setGuidance("");
      toast.success("Question added");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not add that question"),
  });

  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => refresh(),
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

  if (board.isLoading) return <p className="text-sm text-muted-foreground">Loading questions…</p>;
  if (board.error) {
    return <p className="text-sm text-muted-foreground">{(board.error as any)?.message}</p>;
  }

  const data = board.data!;
  const people = data.people;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-5">
        {[
          ["Questions", data.totals.questions],
          ["Sent", data.totals.assigned],
          ["Waiting", data.totals.waiting],
          ["Answered", data.totals.answered],
          ["Needs follow-up", data.totals.followUp],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="pt-6">
              <div className="text-2xl">{value as number}</div>
              <div className="text-xs text-muted-foreground">{label as string}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a question</CardTitle>
          <CardDescription>Write it once, then send it to as many investors as you like.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="q-prompt">Question</Label>
            <Textarea
              id="q-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="How will you fund your commitment?"
              rows={2}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="q-guidance">Guidance (optional)</Label>
              <Input
                id="q-guidance"
                value={guidance}
                onChange={(e) => setGuidance(e.target.value)}
                placeholder="What a good answer looks like"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="q-category">Section</Label>
              <Input
                id="q-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="general"
              />
            </div>
          </div>
          <Button
            onClick={() => addQuestion.mutate()}
            disabled={prompt.trim().length < 3 || addQuestion.isPending}
          >
            {addQuestion.isPending ? "Adding…" : "Add question"}
          </Button>
        </CardContent>
      </Card>

      {data.questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No questions yet.</p>
      ) : null}

      {data.questions.map((q: any) => (
        <Card key={q.id}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">{q.prompt}</CardTitle>
                <CardDescription>
                  {q.category} · sent to {q.assignedCount} · {q.answeredCount} answered
                  {q.guidance ? ` · ${q.guidance}` : ""}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  act.mutate(() => drop({ data: { offering_id: offeringId, id: q.id } }))
                }
              >
                Remove
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium">Send to investors</div>
              {people.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  No investors have access to this fund yet.
                </p>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {people.map((p: any) => {
                      const already = q.assignments.some(
                        (a: any) => a.investor_user_id === p.user_id,
                      );
                      const chosen = (picked[q.id] ?? []).includes(p.user_id);
                      return (
                        <button
                          key={p.user_id}
                          type="button"
                          disabled={already}
                          onClick={() =>
                            setPicked((prev) => {
                              const cur = prev[q.id] ?? [];
                              return {
                                ...prev,
                                [q.id]: cur.includes(p.user_id)
                                  ? cur.filter((x) => x !== p.user_id)
                                  : [...cur, p.user_id],
                              };
                            })
                          }
                          className={`rounded-full border px-3 py-1 text-xs ${
                            already
                              ? "opacity-40"
                              : chosen
                                ? "border-primary bg-primary/10"
                                : "hover:bg-muted"
                          }`}
                        >
                          {p.name ?? p.email ?? "Investor"}
                          {already ? " · sent" : ""}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label htmlFor={`due-${q.id}`} className="text-xs">
                        Due date (optional)
                      </Label>
                      <Input
                        id={`due-${q.id}`}
                        type="date"
                        className="w-44"
                        value={dueDate[q.id] ?? ""}
                        onChange={(e) =>
                          setDueDate((prev) => ({ ...prev, [q.id]: e.target.value }))
                        }
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={(picked[q.id] ?? []).length === 0}
                      onClick={() =>
                        act.mutate(async () => {
                          await assign({
                            data: {
                              offering_id: offeringId,
                              question_id: q.id,
                              investor_user_ids: picked[q.id] ?? [],
                              ...(dueDate[q.id] ? { due_date: dueDate[q.id] } : {}),
                            },
                          });
                          setPicked((prev) => ({ ...prev, [q.id]: [] }));
                          toast.success("Question sent");
                        })
                      }
                    >
                      Send question
                    </Button>
                  </div>
                </>
              )}
            </div>

            {q.assignments.length ? (
              <div className="space-y-3">
                {q.assignments.map((a: any) => (
                  <div key={a.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">
                          {a.investor.name ?? a.investor.email ?? "Investor"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Sent {when(a.created_at)}
                          {a.due_date ? ` · due ${a.due_date}` : ""}
                          {a.answered_at ? ` · answered ${when(a.answered_at)}` : ""}
                        </div>
                      </div>
                      <Badge variant={statusTone(a.status)}>{questionStatusLabel(a.status)}</Badge>
                    </div>

                    <div className="mt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setOpenTrail((prev) => ({ ...prev, [a.id]: !prev[a.id] }))
                        }
                      >
                        {openTrail[a.id] ? "Hide" : "Show"} answers ({a.answers.length})
                      </Button>
                    </div>

                    {openTrail[a.id] ? (
                      <div className="mt-2 space-y-3">
                        <AnswerTrail answers={a.answers} />
                        <Textarea
                          rows={2}
                          placeholder="Reply to the investor"
                          value={replyText[a.id] ?? ""}
                          onChange={(e) =>
                            setReplyText((prev) => ({ ...prev, [a.id]: e.target.value }))
                          }
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!(replyText[a.id] ?? "").trim()}
                            onClick={() =>
                              act.mutate(async () => {
                                await reply({
                                  data: {
                                    offering_id: offeringId,
                                    assignment_id: a.id,
                                    body: replyText[a.id] ?? "",
                                  },
                                });
                                setReplyText((prev) => ({ ...prev, [a.id]: "" }));
                              })
                            }
                          >
                            Send reply
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              act.mutate(() =>
                                review({
                                  data: {
                                    offering_id: offeringId,
                                    assignment_id: a.id,
                                    status: "accepted",
                                  },
                                }),
                              )
                            }
                          >
                            Accept answer
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              act.mutate(() =>
                                review({
                                  data: {
                                    offering_id: offeringId,
                                    assignment_id: a.id,
                                    status: "needs_followup",
                                    ...(replyText[a.id]?.trim()
                                      ? { note: replyText[a.id] as string }
                                      : {}),
                                  },
                                }),
                              )
                            }
                          >
                            Needs follow-up
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              act.mutate(() =>
                                unassign({
                                  data: { offering_id: offeringId, assignment_id: a.id },
                                }),
                              )
                            }
                          >
                            Withdraw
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ---------------------------- investor view --------------------------- */

function InvestorQuestions({ offeringId }: { offeringId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getMyQuestions);
  const answer = useServerFn(answerQuestion);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const mine = useQuery({
    queryKey: ["my-diligence-questions", offeringId],
    queryFn: () => load({ data: { offering_id: offeringId } }),
  });

  const send = useMutation({
    mutationFn: (vars: { assignment_id: string; body: string }) =>
      answer({ data: { offering_id: offeringId, ...vars } }),
    onSuccess: (_r, vars) => {
      setDraft((prev) => ({ ...prev, [vars.assignment_id]: "" }));
      toast.success("Answer sent");
      qc.invalidateQueries({ queryKey: ["my-diligence-questions", offeringId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not send that answer"),
  });

  if (mine.isLoading) return <p className="text-sm text-muted-foreground">Loading questions…</p>;
  const list = mine.data?.questions ?? [];
  if (!list.length) {
    return (
      <p className="text-sm text-muted-foreground">
        The fund team has not asked you anything yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {list.map((row: any) => (
        <Card key={row.assignment_id}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg">{row.question.prompt}</CardTitle>
                {row.question.guidance ? (
                  <CardDescription>{row.question.guidance}</CardDescription>
                ) : null}
              </div>
              <Badge variant={statusTone(row.status)}>{questionStatusLabel(row.status)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {row.due_date ? (
              <p className="text-xs text-muted-foreground">Please answer by {row.due_date}.</p>
            ) : null}
            <AnswerTrail answers={row.answers} />
            <Textarea
              rows={3}
              placeholder="Write your answer"
              value={draft[row.assignment_id] ?? ""}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, [row.assignment_id]: e.target.value }))
              }
            />
            <Button
              size="sm"
              disabled={!(draft[row.assignment_id] ?? "").trim() || send.isPending}
              onClick={() =>
                send.mutate({
                  assignment_id: row.assignment_id,
                  body: draft[row.assignment_id] ?? "",
                })
              }
            >
              Send answer
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DiligenceQuestionBoard({
  offeringId,
  canManage,
}: {
  offeringId: string;
  canManage: boolean;
}) {
  return canManage ? (
    <div className="space-y-6">
      <DiligenceQuestionScoreboard offeringId={offeringId} />
      <ManagerBoard offeringId={offeringId} />
    </div>
  ) : (
    <InvestorQuestions offeringId={offeringId} />
  );
}
