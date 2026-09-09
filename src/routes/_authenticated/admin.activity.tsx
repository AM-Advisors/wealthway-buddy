import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAdminActivity } from "@/lib/admin-activity.functions";

export const Route = createFileRoute("/_authenticated/admin/activity")({
  head: () => ({
    meta: [
      { title: "Activity Log — Harmonious Admin" },
      {
        name: "description",
        content:
          "A timestamped record of every action across Harmonious: funds created, people invited, documents uploaded, diligence rooms opened and reviewer decisions.",
      },
      { property: "og:title", content: "Activity Log — Harmonious Admin" },
      {
        property: "og:description",
        content: "Every action across funds, invitations, documents and diligence rooms, with timestamps.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminActivityPage,
});

const PAGE_SIZE = 50;

const kindLabels: Record<string, string> = {
  fund: "Fund",
  invitation: "Invitation",
  document: "Document",
  diligence: "Diligence room",
  decision: "Review decision",
  access: "Access",
};

const kindTone: Record<string, "default" | "secondary" | "outline"> = {
  fund: "default",
  invitation: "secondary",
  document: "outline",
  diligence: "secondary",
  decision: "default",
  access: "outline",
};

function when(value: string) {
  return new Date(value).toLocaleString();
}

function AdminActivityPage() {
  const fetchLog = useServerFn(listAdminActivity);
  const [kind, setKind] = useState<string>("all");
  const [days, setDays] = useState<string>("30");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ["admin-activity", kind, days, search, page],
    queryFn: () =>
      fetchLog({
        data: {
          ...(kind !== "all" ? { kind: kind as any } : {}),
          ...(days !== "all" ? { days: Number(days) } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      }),
    refetchInterval: 120_000,
  });

  const data = query.data;
  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const counts = data?.counts;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Activity log</h1>
        <p className="text-muted-foreground text-sm">
          Everything that happens across Harmonious, newest first: funds created, people invited,
          documents uploaded, diligence rooms opened and every review decision.
        </p>
      </header>

      {counts ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {Object.entries(kindLabels).map(([key, label]) => (
            <Card key={key}>
              <CardContent className="p-4">
                <p className="text-muted-foreground text-xs">{label}</p>
                <p className="text-xl font-semibold">
                  {(counts as Record<string, number>)[key] ?? 0}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <CardTitle className="text-base">
            {total} {total === 1 ? "entry" : "entries"}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search people, funds, files"
              className="h-9 w-56"
            />
            <Select
              value={kind}
              onValueChange={(v) => {
                setKind(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="h-9 w-44">
                <SelectValue placeholder="All activity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All activity</SelectItem>
                {Object.entries(kindLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={days}
              onValueChange={(v) => {
                setDays(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="h-9 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.isLoading ? (
            <p className="text-muted-foreground text-sm">Loading activity…</p>
          ) : query.isError ? (
            <p className="text-destructive text-sm">
              {(query.error as Error)?.message ?? "Could not load the activity log."}
            </p>
          ) : entries.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing recorded for this filter yet.</p>
          ) : (
            <ol className="space-y-3">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="border-border flex flex-col gap-1 rounded-lg border p-3 md:flex-row md:items-start md:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={kindTone[entry.kind] ?? "outline"}>
                        {kindLabels[entry.kind] ?? entry.kind}
                      </Badge>
                      <span className="text-sm font-medium">{entry.summary}</span>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {[
                        entry.actorName ?? entry.actorEmail,
                        entry.fundName,
                        entry.detail,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <p className="text-muted-foreground shrink-0 text-xs md:text-right">
                    {when(entry.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span className="text-muted-foreground text-xs">
              Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        Looking for review decisions only?{" "}
        <Link to="/manager/activity" className="underline">
          Open the reviewer activity board
        </Link>
        .
      </p>
    </div>
  );
}
