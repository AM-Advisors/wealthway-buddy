/**
 * Operations Home — the daily work queue.
 *
 * Everything on this page is a reading of a workflow record that lives
 * somewhere else: an onboarding, a capital call, a bank line, a journal entry,
 * a valuation, a NAV version, an allocation run, a report, a document. The
 * page stores nothing, decides nothing and approves nothing. Each row opens
 * the record where the real, audited action takes place.
 */

import { useState } from "react";

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SECTION_EMPTY,
  SECTION_TITLES,
  WORK_SECTIONS,
  type WorkPriority,
  type WorkSection,
} from "@/lib/ops-work-items";
import { getOpsRecentActivity, getOpsWorkQueue } from "@/lib/ops-work-queue.functions";

const ANY = "__any";

const PRIORITY_TONE: Record<WorkPriority, "default" | "secondary" | "destructive" | "outline"> = {
  critical: "destructive",
  high: "default",
  normal: "secondary",
  low: "outline",
};

const PRIORITY_LABEL: Record<WorkPriority, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
};

function areaLabel(area: string) {
  return area.charAt(0).toUpperCase() + area.slice(1);
}

function when(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

export function OperationsWorkHome() {
  const loadQueue = useServerFn(getOpsWorkQueue);
  const loadActivity = useServerFn(getOpsRecentActivity);

  const [section, setSection] = useState<WorkSection | "">("");
  const [fundId, setFundId] = useState("");
  const [clientId, setClientId] = useState("");
  const [area, setArea] = useState("");
  const [priority, setPriority] = useState("");
  const [scope, setScope] = useState<"mine" | "all">("all");
  const [page, setPage] = useState(1);

  const filters = {
    ...(section ? { section } : {}),
    ...(fundId ? { fundId } : {}),
    ...(clientId ? { clientId } : {}),
    ...(area ? { area: area as never } : {}),
    ...(priority ? { priority: priority as WorkPriority } : {}),
    ...(scope === "mine" ? { scope: "mine" as const } : {}),
  };

  const queue = useQuery({
    queryKey: ["ops-work-queue", filters, page],
    queryFn: () => loadQueue({ data: { filters, page, pageSize: 25 } }),
    refetchInterval: 60_000,
  });
  const activity = useQuery({
    queryKey: ["ops-recent-activity"],
    queryFn: () => loadActivity({ data: { limit: 12 } }),
  });

  const data = queue.data;
  const reset = (apply: () => void) => {
    apply();
    setPage(1);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-2xl">Operations</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Work waiting on the Harmonious team, read straight from each workflow. Open an item to act on it
        in the record itself.
      </p>

      {queue.isError && (
        <p className="mt-6 text-sm text-muted-foreground">
          {(queue.error as any)?.message ?? "This is unavailable right now."}
        </p>
      )}
      {queue.isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}

      {data && (
        <>
          {/* Counts are only useful because each one opens the work behind it. */}
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => reset(() => setSection(""))}
              className={`rounded-md border px-3 py-1.5 text-sm ${section === "" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
            >
              All work ({data.total})
            </button>
            {WORK_SECTIONS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => reset(() => setSection(key))}
                className={`rounded-md border px-3 py-1.5 text-sm ${section === key ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
              >
                {SECTION_TITLES[key]} ({data.sectionCounts[key] ?? 0})
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Select
              value={scope}
              onValueChange={(v) => reset(() => setScope(v as "mine" | "all"))}
            >
              <SelectTrigger className="w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All work I may act on</SelectItem>
                <SelectItem value="mine">Assigned to me ({data.mine})</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={clientId || ANY}
              onValueChange={(v) => reset(() => setClientId(v === ANY ? "" : v))}
            >
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="Any client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any client</SelectItem>
                {data.clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={fundId || ANY}
              onValueChange={(v) => reset(() => setFundId(v === ANY ? "" : v))}
            >
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="Any fund" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any fund</SelectItem>
                {data.funds.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={area || ANY} onValueChange={(v) => reset(() => setArea(v === ANY ? "" : v))}>
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="Any work area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any work area</SelectItem>
                {Object.entries(data.byArea).map(([key, count]) => (
                  <SelectItem key={key} value={key}>
                    {areaLabel(key)} ({count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={priority || ANY}
              onValueChange={(v) => reset(() => setPriority(v === ANY ? "" : v))}
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Any priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any priority</SelectItem>
                {(["critical", "high", "normal", "low"] as WorkPriority[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABEL[p]} ({(data.byPriority as Record<string, number>)[p] ?? 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">
                {section ? SECTION_TITLES[section] : "Everything waiting"}
              </CardTitle>
              <CardDescription>
                {data.total === 0
                  ? section
                    ? SECTION_EMPTY[section]
                    : "Nothing is waiting on the team right now."
                  : `${data.total} item${data.total === 1 ? "" : "s"}, most pressing first.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={PRIORITY_TONE[item.priority]}>{PRIORITY_LABEL[item.priority]}</Badge>
                      <p className="truncate text-sm">{item.title}</p>
                      {item.blocked && <Badge variant="destructive">Blocked</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.blocked && item.blockReason ? item.blockReason : item.reason}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[
                        item.fundName,
                        item.clientName,
                        item.assignedToName ? `Owner: ${item.assignedToName}` : null,
                        when(item.dueDate) ? `Due ${when(item.dueDate)}` : null,
                        `Status: ${item.workflowState.replace(/_/g, " ")}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to={item.destination as never}>
                      {item.requiredAction === "prepare" ? "Open" : "Review"}
                    </Link>
                  </Button>
                </div>
              ))}
              {data.items.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {section ? SECTION_EMPTY[section] : "You are all caught up."}
                </p>
              )}
              {data.pages > 1 && (
                <div className="flex items-center justify-between pt-2 text-sm">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={data.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-muted-foreground">
                    Page {data.page} of {data.pages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={data.page >= data.pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Not configured yet</CardTitle>
              <CardDescription>
                These areas have no authoritative workflow behind them, so they show nothing rather than a
                misleading zero.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.unconfigured.map((entry) => (
                <p key={entry.area} className="text-sm text-muted-foreground">
                  {entry.message}
                </p>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
          <CardDescription>Who did what, from the platform's own audit trail.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {activity.data?.activity.map((entry, index) => (
            <p key={`${entry.at}-${index}`} className="text-sm">
              <span className="text-muted-foreground">{when(entry.at) ?? ""} · </span>
              {entry.actor} ({entry.capacity}) {entry.action} — {entry.resource}
            </p>
          ))}
          {activity.data && activity.data.activity.length === 0 && (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          )}
          {activity.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">
        Banking requests, EINs and tax paperwork remain under{" "}
        <Link to="/ops/banking" className="underline">
          Banking
        </Link>
        ,{" "}
        <Link to="/ops/ss4" className="underline">
          EIN and SS-4
        </Link>{" "}
        and{" "}
        <Link to="/ops/tax-documents" className="underline">
          Tax documents
        </Link>
        .
      </p>
    </div>
  );
}
