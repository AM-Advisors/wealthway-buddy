import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listReviewerActivity } from "@/lib/reviewer-activity.functions";

export const Route = createFileRoute("/_authenticated/manager/activity")({
  head: () => ({
    meta: [
      { title: "Reviewer Activity — Harmonious Manager" },
      {
        name: "description",
        content:
          "See which reviewer approved, delayed or declined each investor application, wire confirmation and payment, with timestamps.",
      },
      { property: "og:title", content: "Reviewer Activity — Harmonious Manager" },
      {
        property: "og:description",
        content: "A timestamped record of every reviewer decision on the review board.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewerActivityPage,
});

const PAGE_SIZE = 50;

const outcomeTone: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  approved: "default",
  declined: "destructive",
  delayed: "secondary",
  resolved: "outline",
};

const areaLabels: Record<string, string> = {
  kyc: "Identity",
  aml: "AML",
  accreditation: "Accreditation",
  documents: "Documents",
  wire: "Wire",
  funding: "Funding",
};

function when(value: string) {
  return new Date(value).toLocaleString();
}

function ReviewerActivityPage() {
  const [fund, setFund] = useState("all");
  const [reviewer, setReviewer] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const [days, setDays] = useState("30");
  const [page, setPage] = useState(0);

  const load = useServerFn(listReviewerActivity);
  const { data, isLoading, error } = useQuery({
    queryKey: ["reviewer-activity", fund, reviewer, outcome, days, page],
    queryFn: () =>
      load({
        data: {
          ...(fund !== "all" ? { offeringId: fund } : {}),
          ...(reviewer !== "all" ? { actorId: reviewer } : {}),
          ...(outcome !== "all" ? { outcome } : {}),
          ...(days !== "all" ? { days: Number(days) } : {}),
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      }),
    refetchInterval: 30_000,
  });

  const events = data?.events ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reviewer activity</h1>
          <p className="text-sm text-muted-foreground">
            Every approval, delay and decline made on the review board, with who did it and when.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/manager">Back to panel</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <Select
            value={fund}
            onValueChange={(v) => {
              setFund(v);
              setPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All funds" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All funds</SelectItem>
              {(data?.funds ?? []).map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={reviewer}
            onValueChange={(v) => {
              setReviewer(v);
              setPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All reviewers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reviewers</SelectItem>
              {(data?.reviewers ?? []).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={outcome}
            onValueChange={(v) => {
              setOutcome(v);
              setPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All outcomes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outcomes</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="delayed">Delayed</SelectItem>
              <SelectItem value="declined">Declined</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={days}
            onValueChange={(v) => {
              setDays(v);
              setPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Last 30 days" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {total} {total === 1 ? "action" : "actions"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading activity…</p>
          ) : error ? (
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : "Could not load activity."}
            </p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No reviewer actions recorded for this filter yet.
            </p>
          ) : (
            events.map((e) => (
              <div key={e.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{e.actorName}</span>
                  {e.outcome ? (
                    <Badge variant={outcomeTone[e.outcome] ?? "outline"}>{e.outcome}</Badge>
                  ) : null}
                  {e.area ? (
                    <Badge variant="outline">{areaLabels[e.area] ?? e.area}</Badge>
                  ) : null}
                  <span className="text-xs text-muted-foreground">{when(e.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm">{e.summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[e.investorName, e.fundName].filter(Boolean).join(" · ") || "—"}
                </p>
                {e.note ? (
                  <p className="mt-1 text-xs text-muted-foreground">Note: {e.note}</p>
                ) : null}
                {e.applicationId ? (
                  <Button asChild size="sm" variant="ghost" className="mt-1 h-7 px-2">
                    <Link
                      to="/manager/$applicationId"
                      params={{ applicationId: e.applicationId }}
                    >
                      Open review
                    </Link>
                  </Button>
                ) : null}
              </div>
            ))
          )}

          {total > PAGE_SIZE ? (
            <div className="flex items-center justify-between pt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={(page + 1) * PAGE_SIZE >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
