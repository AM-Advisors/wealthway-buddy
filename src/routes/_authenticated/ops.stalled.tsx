import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getStalledWork } from "@/lib/ops-work-queue.functions";

export const Route = createFileRoute("/_authenticated/ops/stalled")({
  head: () => ({
    meta: [
      { title: "Stalled items | Harmonious Operations" },
      { name: "description", content: "Every stalled fund and investor item, with the exact action needed and who owns it." },
      { property: "og:title", content: "Stalled items | Harmonious Operations" },
      { property: "og:description", content: "Every stalled fund and investor item, with the exact action needed and who owns it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StalledPage,
});

function StalledPage() {
  const load = useServerFn(getStalledWork);
  const q = useQuery({ queryKey: ["ops-stalled"], queryFn: () => load() });
  const [owner, setOwner] = useState<"all" | "Investor" | "Fund manager">("all");
  const [fund, setFund] = useState("all");
  const items = q.data ?? [];
  const funds = useMemo(() => [...new Map(items.map((i) => [i.fundId, i.fundName ?? "Fund"])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [items]);
  const shown = items.filter((i) => (owner === "all" || i.owner === owner) && (fund === "all" || i.fundId === fund));
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl">Stalled items</h1>
        <p className="text-base text-muted-foreground">Fund managers own this work. This page shows where it is stuck so Harmonious can follow up. Nothing here changes a record.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Who it waits on" className="min-h-11 rounded-md border bg-background px-3 text-base" value={owner} onChange={(e) => setOwner(e.target.value as any)}>
          <option value="all">Everyone</option><option value="Fund manager">Waiting on fund manager</option><option value="Investor">Waiting on investor</option>
        </select>
        <select aria-label="Fund" className="min-h-11 rounded-md border bg-background px-3 text-base" value={fund} onChange={(e) => setFund(e.target.value)}>
          <option value="all">All funds</option>{funds.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
      </div>
      {q.isError ? <p role="alert" className="text-destructive">Stalled items couldn't be loaded. You may not have Operations access, or try refreshing.</p>
        : q.isLoading ? <p className="text-muted-foreground">Loading stalled items…</p>
        : !shown.length ? <p className="text-muted-foreground">Nothing is stalled right now.</p>
        : <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{shown.length} stalled item{shown.length === 1 ? "" : "s"}, longest waiting first</p>
            {shown.map((i) => (
              <Card key={i.id}><CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <p className="text-base font-medium">{i.action}</p>
                  <p className="text-sm text-muted-foreground">{i.fundName ?? "Fund"}{i.investorName ? ` · ${i.investorName}` : ""}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Waiting on {i.owner === "Investor" ? "investor" : "fund manager"}</Badge>
                    {i.days !== null && <Badge variant="secondary">{i.days} day{i.days === 1 ? "" : "s"}</Badge>}
                  </div>
                </div>
                <Link to={i.href as any} className="min-h-11 rounded-md border px-4 py-2 text-base">Open</Link>
              </CardContent></Card>
            ))}
          </div>}
    </div>
  );
}
