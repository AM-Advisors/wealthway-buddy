import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FundFilingStatusCard, urgencyBadge } from "@/components/fund-filing-status";
import { fmtDate } from "@/components/fund-tabs/shared";
import { listRegulatoryTracker } from "@/lib/regulatory-tracker.functions";

export const Route = createFileRoute("/_authenticated/ops/regulatory-filings")({
  head: () => ({
    meta: [
      { title: "Form D and Blue Sky filings | Harmonious Operations" },
      { name: "description", content: "Where every fund's Form D and state Blue Sky notice filings stand, with due dates and next steps." },
      { property: "og:title", content: "Form D and Blue Sky filings | Harmonious Operations" },
      { property: "og:description", content: "Form D and Blue Sky filing status across every fund." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Filter = "all" | "attention" | "overdue" | "done";

function Page() {
  const qc = useQueryClient();
  const load = useServerFn(listRegulatoryTracker);
  const q = useQuery({ queryKey: ["ops-regulatory-tracker"], queryFn: () => load() });
  const [filter, setFilter] = useState<Filter>("attention");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const rows = (q.data ?? []) as any[];
  const counts = useMemo(() => ({
    overdue: rows.filter((r) => r.status.urgency === "overdue").length,
    soon: rows.filter((r) => r.status.urgency === "due_soon").length,
    open: rows.filter((r) => r.status.urgency === "open").length,
    done: rows.filter((r) => r.status.urgency === "done" || r.status.urgency === "not_needed").length,
    missingState: rows.reduce((a, r) => a + r.status.investorsMissingState, 0),
    noOwner: rows.filter((r) => !r.formDResponsibility && r.status.urgency !== "not_needed").length,
  }), [rows]);
  const shown = rows.filter((r) => {
    const u = r.status.urgency;
    if (filter === "attention" && !["overdue", "due_soon", "open"].includes(u)) return false;
    if (filter === "overdue" && u !== "overdue") return false;
    if (filter === "done" && !["done", "not_needed"].includes(u)) return false;
    const t = search.trim().toLowerCase();
    return !t || `${r.fundName} ${r.clientName ?? ""}`.toLowerCase().includes(t);
  });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["ops-regulatory-tracker"] }); };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Form D and Blue Sky filings</h1>
        <p className="text-base text-muted-foreground">Every fund that has sold interests. Record the date of first sale, prepare the packets, file them yourself on EDGAR and the state system, then have a second person record the confirmation. Nothing is filed or paid automatically.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[["Past due", counts.overdue], ["Due in 7 days", counts.soon], ["Open", counts.open], ["Up to date", counts.done], ["Investors missing a state", counts.missingState], ["Who files not set", counts.noOwner]].map(([l, n]) => (
          <Card key={l as string}><CardContent className="p-4"><p className="text-2xl font-semibold">{n as number}</p><p className="text-sm text-muted-foreground">{l as string}</p></CardContent></Card>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {([["attention", "Needs work"], ["overdue", "Past due"], ["done", "Up to date"], ["all", "All funds"]] as [Filter, string][]).map(([v, l]) => (
          <Button key={v} size="sm" variant={filter === v ? "default" : "outline"} onClick={() => setFilter(v)}>{l}</Button>
        ))}
        <Input placeholder="Search fund or client" value={search} onChange={(e) => setSearch(e.target.value)} className="ml-auto max-w-64" />
      </div>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
       q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> :
       !shown.length ? <p className="text-sm text-muted-foreground">No funds in this view.</p> : (
        <div className="space-y-3">
          {shown.map((r) => (
            <Card key={r.fundId}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold">{r.fundName}</p>
                    <p className="text-sm text-muted-foreground">
                      {r.clientName ? `${r.clientName} · ` : ""}{r.regType === "506c" ? "Rule 506(c)" : r.regType === "506b" ? "Rule 506(b)" : r.regType ?? "Exemption not set"}
                      {" · "}{r.status.responsibilityLabel}
                      {r.status.formD.dueOn && r.status.formD.stage !== "filed" && r.status.formD.stage !== "not_needed" ? ` · Form D due ${fmtDate(r.status.formD.dueOn)}` : ""}
                    </p>
                    <p className="mt-1 text-sm font-medium">{r.status.nextStep}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {urgencyBadge(r.status.urgency)}
                    <Button size="sm" variant="outline" onClick={() => setOpen(open === r.fundId ? null : r.fundId)}>{open === r.fundId ? "Close" : "Work on it"}</Button>
                    <Button size="sm" variant="ghost" asChild><Link to="/ops/fund/$fundId" params={{ fundId: r.fundId }} search={{ tab: "regulatory" }}>Open fund</Link></Button>
                  </div>
                </div>
                {open === r.fundId && <FundFilingStatusCard fundId={r.fundId} overview={r} staff onChanged={refresh} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
