import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  getQuestionScoreboard,
  questionStatusLabel,
} from "@/lib/diligence-questions.functions";

function when(value?: string | null) {
  if (!value) return "never";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DiligenceQuestionScoreboard({ offeringId }: { offeringId: string }) {
  const load = useServerFn(getQuestionScoreboard);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const board = useQuery({
    queryKey: ["diligence-question-scoreboard", offeringId],
    queryFn: () => load({ data: { offering_id: offeringId } }),
    refetchInterval: 120000,
  });

  if (board.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading the scoreboard…</p>;
  }
  if (board.error) return null;

  const data = board.data!;
  if (!data.totals.assigned) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Answer scoreboard</CardTitle>
        <CardDescription>
          Who has answered what, scored out of 100. Accepted answers count in full, answers still
          waiting on your review count half.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["Overall score", `${data.totals.score}%`],
            ["People asked", data.totals.people],
            ["Still unanswered", data.totals.outstanding],
            ["Past due", data.totals.overdue],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-md border p-3">
              <div className="text-2xl">{value as string | number}</div>
              <div className="text-xs text-muted-foreground">{label as string}</div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {data.people.map((p: any) => (
            <div key={p.user_id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{p.name ?? p.email ?? "Investor"}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.accepted} accepted · {p.answered} awaiting review · {p.waiting} not started
                    {p.followUp ? ` · ${p.followUp} needing follow-up` : ""} · last answer{" "}
                    {when(p.lastAnswerAt)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {p.overdueCount ? (
                    <Badge variant="destructive">{p.overdueCount} past due</Badge>
                  ) : null}
                  <div className="text-right">
                    <div className="text-lg">{p.score}%</div>
                    <div className="text-xs text-muted-foreground">{p.assigned} asked</div>
                  </div>
                </div>
              </div>
              <Progress value={p.score} className="mt-2 h-2" />

              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setOpen((prev) => ({ ...prev, [p.user_id]: !prev[p.user_id] }))}
              >
                {open[p.user_id] ? "Hide" : "Show"} detail ({p.outstandingCount} unanswered)
              </Button>

              {open[p.user_id] ? (
                <div className="mt-2 grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      Still unanswered
                    </div>
                    {p.outstanding.length === 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">Nothing outstanding.</p>
                    ) : (
                      <ul className="mt-1 space-y-2">
                        {p.outstanding.map((o: any) => (
                          <li key={o.assignment_id} className="text-sm">
                            <div>{o.prompt}</div>
                            <div className="text-xs text-muted-foreground">
                              {questionStatusLabel(o.status)}
                              {o.due_date ? ` · due ${o.due_date}` : ""}
                              {o.overdue ? " · past due" : ""}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      Answer trail
                    </div>
                    {p.trail.length === 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">No answers yet.</p>
                    ) : (
                      <ol className="mt-1 space-y-2 border-l pl-4">
                        {p.trail.map((t: any, i: number) => (
                          <li key={`${p.user_id}-${i}`} className="text-sm">
                            <div className="text-xs text-muted-foreground">{when(t.at)}</div>
                            <div>{t.prompt}</div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Question by question
          </div>
          <div className="mt-2 space-y-2">
            {data.questions.map((q: any) => (
              <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm">{q.prompt}</div>
                  <div className="text-xs text-muted-foreground">
                    {q.category} · sent to {q.assigned} · {q.unanswered} unanswered
                  </div>
                </div>
                <Badge variant={q.unanswered ? "outline" : "default"}>{q.completion}%</Badge>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
