import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { HelpTip } from "@/components/help-tip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { filterMyFunds, MY_FUNDS_FILTERS, type MyFundsFilter } from "@/lib/client-portal-model";
import { getMyFunds } from "@/lib/my-funds.functions";

export const Route = createFileRoute("/_authenticated/my-funds/")({
  head: () => ({
    meta: [
      { title: "My Funds — Harmonious" },
      { name: "description", content: "Every fund and SPV you manage or invest in, filtered by fund type." },
      { property: "og:title", content: "My Funds — Harmonious" },
      { property: "og:description", content: "Funds and SPVs you manage or invest in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyFundsPage,
});

function MyFundsPage() {
  const load = useServerFn(getMyFunds);
  const q = useQuery({ queryKey: ["my-funds"], queryFn: () => load() });
  const [filter, setFilter] = useState<MyFundsFilter>("all");
  const funds = q.data?.funds ?? [];
  const shown = filterMyFunds(funds, filter);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Funds</h1>
        <p className="mt-1 text-sm text-muted-foreground">Funds and SPVs you manage or invest in.</p>
      </div>
      <div role="tablist" aria-label="Filter by fund type" className="flex flex-wrap gap-2">
        {MY_FUNDS_FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-sm ${filter === f.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {f.label}
            {f.key !== "all" ? ` (${funds.filter((x) => x.filter === f.key).length})` : ""}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your funds…</p>
      ) : shown.length === 0 ? (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">{funds.length ? "No funds of this type." : "You aren't connected to any funds yet."}</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((f) => (
            <Card key={f.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  <Link to={f.path as any} className="hover:underline">{f.name}</Link>
                </CardTitle>
                <CardDescription>
                  {f.typeLabel}
                  {f.typeLabel === "SPV" ? <HelpTip helpKey="spv" /> : null}
                  {f.client ? ` · ${f.client}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">{f.relationshipLabel}</Badge>
                <Badge variant="outline">{f.status}</Badge>
                {f.setupStatus ? <span className="text-xs text-muted-foreground">{f.setupStatus}</span> : null}
                {f.outstandingActions ? <span className="text-xs text-muted-foreground">· {f.outstandingActions} to review</span> : null}
                {f.relationships.includes("investor") && f.relationships.includes("fund_manager") ? (
                  <Link to="/my-funds/$fundId" params={{ fundId: f.id }} className="text-xs text-primary underline">Investor view</Link>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
