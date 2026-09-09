import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  EVENT_KIND_LABELS,
  listDocumentEvents,
  type DocumentEventKind,
} from "@/lib/document-log.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin/document-log")({
  head: () => ({
    meta: [
      { title: "Document Activity Log — Harmonious Admin" },
      {
        name: "description",
        content:
          "Every fund document upload, signature and review decision with timestamps and the person responsible.",
      },
      { property: "og:title", content: "Document Activity Log — Harmonious Admin" },
      {
        property: "og:description",
        content: "Audit every document uploaded, signed, edited or rejected across Harmonious funds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DocumentLogPage,
  errorComponent: () => (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl">Document activity</h1>
      <p className="mt-2 text-muted-foreground">
        This log could not be loaded. Refresh the page, or check that you still have reviewer access.
      </p>
    </main>
  ),
  notFoundComponent: () => <p className="p-6">Page not found.</p>,
});

const KIND_ORDER: DocumentEventKind[] = [
  "fund_document_added",
  "fund_document_updated",
  "fund_document_removed",
  "signed",
  "investor_upload",
  "accreditation_upload",
  "diligence_upload",
  "review_approved",
  "review_rejected",
];

function toneFor(kind: DocumentEventKind): "default" | "secondary" | "destructive" | "outline" {
  if (kind === "signed" || kind === "review_approved") return "default";
  if (kind === "review_rejected" || kind === "fund_document_removed") return "destructive";
  if (kind === "fund_document_added" || kind === "fund_document_updated") return "secondary";
  return "outline";
}

function when(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DocumentLogPage() {
  const [fund, setFund] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");
  const load = useServerFn(listDocumentEvents);

  const query = useQuery({
    queryKey: ["document-log", fund, kind],
    queryFn: () =>
      load({
        data: {
          offeringId: fund === "all" ? null : fund,
          kind: kind === "all" ? null : kind,
          limit: 200,
        },
      }),
    refetchInterval: 30000,
  });

  const events = query.data?.events ?? [];
  const funds = query.data?.funds ?? [];

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">Document activity</h1>
          <p className="mt-1 text-muted-foreground">
            Every document added, uploaded, signed or rejected — with the time it happened and who did it.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin">Review queue</Link>
        </Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="log_fund">Fund</Label>
          <select
            id="log_fund"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={fund}
            onChange={(e) => setFund(e.target.value)}
          >
            <option value="all">All funds</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="log_kind">Activity</Label>
          <select
            id="log_kind"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="all">Everything</option>
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {EVENT_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">
            {query.isLoading ? "Loading…" : `${events.length} entries`}
          </CardTitle>
          <CardDescription>
            Newest first. This page refreshes itself every 30 seconds.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!query.isLoading && events.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing recorded yet for this selection.
            </p>
          )}
          {events.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={toneFor(e.kind)}>{EVENT_KIND_LABELS[e.kind]}</Badge>
                  <span className="font-medium">{e.document}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {e.actor}
                  {e.offeringName ? ` · ${e.offeringName}` : ""}
                  {e.detail ? ` · ${e.detail}` : ""}
                </p>
                {e.applicationId && (
                  <Link
                    className="mt-1 inline-block text-sm underline"
                    to="/admin/$applicationId"
                    params={{ applicationId: e.applicationId }}
                  >
                    Open application
                  </Link>
                )}
              </div>
              <span className="whitespace-nowrap text-sm text-muted-foreground">{when(e.at)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
