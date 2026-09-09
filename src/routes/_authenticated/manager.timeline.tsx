import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { getManagerFunds } from "@/lib/manager.functions";
import {
  getFundTimelines,
  type InvestorTimeline,
  type TimelineStep,
} from "@/lib/application-timeline.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/manager/timeline")({
  head: () => ({
    meta: [
      { title: "Application Timeline — Harmonious Fund Managers" },
      {
        name: "description",
        content:
          "Follow every investor in your fund step by step, from invitation through identity checks, signing and funding, with a full dated history.",
      },
      { property: "og:title", content: "Application Timeline — Harmonious Fund Managers" },
      {
        property: "og:description",
        content: "Step-by-step progress and dated history for each investor application.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagerTimelinePage,
  errorComponent: () => (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl">Application timeline</h1>
      <p className="mt-2 text-muted-foreground">
        This page could not be loaded. Refresh, or check that your account manages a fund.
      </p>
    </main>
  ),
});

function when(at: string | null) {
  if (!at) return null;
  return new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function stepColor(state: TimelineStep["state"]) {
  if (state === "done") return "bg-primary text-primary-foreground border-primary";
  if (state === "attention") return "bg-destructive text-destructive-foreground border-destructive";
  if (state === "current") return "bg-background text-foreground border-primary";
  return "bg-muted text-muted-foreground border-muted";
}

function StepTrack({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="mt-3 flex flex-wrap gap-x-1 gap-y-3">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1">
          <div
            className={`flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-xs ${stepColor(s.state)}`}
            title={[s.label, when(s.at), s.detail].filter(Boolean).join(" · ")}
          >
            {s.state === "done" ? "✓" : i + 1}
          </div>
          <div className="mr-2 leading-tight">
            <p className="text-xs font-medium">{s.label}</p>
            <p className="text-[11px] text-muted-foreground">
              {when(s.at) ?? s.detail ?? (s.state === "current" ? "In progress" : "Not yet")}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function InvestorCard({ row }: { row: InvestorTimeline }) {
  const [open, setOpen] = useState(false);
  const done = row.steps.filter((s) => s.state === "done").length;
  const current = row.steps.find((s) => s.state === "current" || s.state === "attention");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{row.name}</CardTitle>
            <CardDescription>
              {row.email ?? "No email on file"}
              {row.commitmentCents
                ? ` · $${(row.commitmentCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })} committed`
                : ""}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={done === row.steps.length ? "default" : "secondary"}>
              {done} of {row.steps.length} steps
            </Badge>
            {current && <Badge variant="outline">Next: {current.label}</Badge>}
            <Button asChild size="sm" variant="outline">
              <Link to="/manager/$applicationId" params={{ applicationId: row.applicationId }}>
                Open review
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <StepTrack steps={row.steps} />
        <Button size="sm" variant="ghost" className="mt-3 px-0" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide history" : `Show history (${row.events.length})`}
        </Button>
        {open && (
          <ul className="mt-2 space-y-2 border-l pl-4">
            {row.events.length === 0 && (
              <li className="text-sm text-muted-foreground">No recorded activity yet.</li>
            )}
            {row.events.map((e, i) => (
              <li key={`${e.at}-${i}`} className="relative text-sm">
                <span className="absolute -left-[21px] top-2 h-2 w-2 rounded-full bg-muted-foreground" />
                <p className="font-medium">{e.title}</p>
                <p className="text-xs text-muted-foreground">
                  {when(e.at)}
                  {e.detail ? ` · ${e.detail}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ManagerTimelinePage() {
  const funds = useServerFn(getManagerFunds);
  const timelines = useServerFn(getFundTimelines);

  const fundsQuery = useQuery({ queryKey: ["manager-funds"], queryFn: () => funds() });
  const fundList = fundsQuery.data?.funds ?? [];
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!offeringId && fundList.length > 0) setOfferingId(fundList[0]!.id);
  }, [fundList, offeringId]);

  const timelineQuery = useQuery({
    queryKey: ["fund-timelines", offeringId],
    queryFn: () => timelines({ data: { offeringId: offeringId! } }),
    enabled: !!offeringId,
    refetchInterval: 30000,
  });

  const rows: InvestorTimeline[] = useMemo(() => {
    const all = (timelineQuery.data as any)?.timelines ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter(
      (r: InvestorTimeline) =>
        r.name.toLowerCase().includes(term) || (r.email ?? "").toLowerCase().includes(term),
    );
  }, [timelineQuery.data, search]);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">Application timeline</h1>
          <p className="mt-1 text-muted-foreground">
            Every investor's journey in this fund, from invitation to funded, with the dated history
            behind each step.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/manager">Back to my funds</Link>
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {fundList.map((f: any) => (
          <Button
            key={f.id}
            size="sm"
            variant={offeringId === f.id ? "default" : "outline"}
            onClick={() => setOfferingId(f.id)}
          >
            {f.name}
          </Button>
        ))}
      </div>

      <div className="mt-4 max-w-sm">
        <Input
          placeholder="Search investors by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mt-5 space-y-4">
        {fundsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading your funds…</p>}
        {!fundsQuery.isLoading && fundList.length === 0 && (
          <p className="text-sm text-muted-foreground">No funds are assigned to your account yet.</p>
        )}
        {timelineQuery.isLoading && offeringId && (
          <p className="text-sm text-muted-foreground">Loading investor timelines…</p>
        )}
        {!timelineQuery.isLoading && offeringId && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No investors match this view yet.</p>
        )}
        {rows.map((row) => (
          <InvestorCard key={row.applicationId} row={row} />
        ))}
      </div>
    </main>
  );
}
