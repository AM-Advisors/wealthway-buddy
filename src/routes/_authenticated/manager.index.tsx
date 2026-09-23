import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Search } from "lucide-react";

import { getManagerPanelSummary } from "@/lib/manager.functions";
import { getManagerFundProgress } from "@/lib/manager-fund.functions";
import { money, prettyStatus } from "@/lib/status";
import { AlertPreferenceToggle } from "@/components/alert-preference-toggle";
import { AttentionCenter } from "@/components/attention-center";

import { FundInvitations } from "@/components/fund-invitations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/manager/")({
  head: () => ({
    meta: [
      { title: "My Funds — Harmonious" },
      { name: "description", content: "Portfolio status, capital, investor activity, approvals, and exceptions across the funds you manage." },
      { property: "og:title", content: "My Funds — Harmonious" },
      { property: "og:description", content: "Portfolio status, capital, investor activity, approvals, and exceptions across managed funds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagerPortfolio,
});

function ManagerPortfolio() {
  const load = useServerFn(getManagerPanelSummary);
  const loadProgress = useServerFn(getManagerFundProgress);
  const summary = useQuery({ queryKey: ["manager-panel-summary"], queryFn: () => load(), refetchInterval: 60_000 });
  const progress = useQuery({ queryKey: ["manager-fund-progress"], queryFn: () => loadProgress() });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const funds = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (summary.data?.funds ?? []).filter((fund: any) =>
      (status === "all" || (status === "open" ? fund.isOpen : !fund.isOpen)) &&
      (!term || String(fund.name).toLowerCase().includes(term) || String(fund.fundType ?? "").toLowerCase().includes(term)),
    );
  }, [search, status, summary.data]);

  if (summary.isLoading) return <main className="mx-auto max-w-7xl px-4 py-10 text-sm text-muted-foreground">Loading funds…</main>;
  if (summary.isError || !summary.data) return <main className="mx-auto max-w-3xl px-4 py-16"><h1 className="text-2xl">Fund management is unavailable</h1><p className="mt-2 text-sm text-muted-foreground">This workspace is limited to assigned fund managers and administrators.</p></main>;

  const all = summary.data.funds as any[];
  const progressOf = (id: string) => (progress.data?.funds ?? []).find((row: any) => row.id === id);
  const totals = {
    active: all.filter((fund) => fund.isOpen).length,
    committed: all.reduce((sum, fund) => sum + Number(fund.committedCents ?? 0), 0),
    received: all.reduce((sum, fund) => sum + Number(fund.receivedCents ?? 0), 0),
    approvals: all.reduce((sum, fund) => sum + fund.identity + fund.accreditation + fund.documents, 0),
    exceptions: all.reduce((sum, fund) => sum + fund.openFlags + fund.pendingWires, 0),
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-medium uppercase text-muted-foreground">Fund management</p><h1 className="mt-1 text-3xl">My funds</h1><p className="mt-2 text-sm text-muted-foreground">Capital, investors, readiness, and outstanding work across your portfolio.</p></div>
        <div className="flex gap-2"><Button asChild size="sm" variant="outline"><Link to="/manager/approvals">Review approvals</Link></Button>{summary.data.isAdmin ? <Button asChild size="sm"><Link to="/admin/setup">Add fund</Link></Button> : null}</div>
      </div>

      <div className="mt-6 grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Active funds" value={String(totals.active)} />
        <Metric label="Committed capital" value={money(totals.committed)} />
        <Metric label="Capital received" value={money(totals.received)} />
        <Metric label="Pending reviews" value={String(totals.approvals)} />
        <Metric label="Open exceptions" value={String(totals.exceptions)} alert={totals.exceptions > 0} />
      </div>

      <div className="mt-6">
        <AttentionCenter workspace="fund_manager" />
      </div>



      <Card className="mt-6">
        <CardHeader className="border-b"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="text-base">Portfolio</CardTitle><CardDescription>{all.length} {all.length === 1 ? "fund" : "funds"} available to your account</CardDescription></div><div className="flex w-full gap-2 sm:w-auto"><div className="relative min-w-0 flex-1 sm:w-64"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search funds" /></div><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent></Select></div></div></CardHeader>
        <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[960px] text-left text-sm"><thead className="border-b bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Fund</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Investors</th><th className="px-4 py-3 font-medium">Committed</th><th className="px-4 py-3 font-medium">Received</th><th className="px-4 py-3 font-medium">Readiness</th><th className="px-4 py-3 font-medium">Next action</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y">{funds.map((fund: any) => { const setup = progressOf(fund.id); const next = fund.openFlags > 0 ? `${fund.openFlags} exceptions` : fund.pendingWires > 0 ? `${fund.pendingWires} wires to review` : fund.identity + fund.accreditation > 0 ? `${fund.identity + fund.accreditation} checks pending` : "No urgent action"; return <tr key={fund.id} className="hover:bg-muted/30"><td className="px-4 py-4"><p className="font-medium">{fund.name}</p><p className="text-xs text-muted-foreground">{fund.fundType ? prettyStatus(fund.fundType) : `Reg D ${fund.regType}`}</p></td><td className="px-4 py-4"><Badge variant={fund.isOpen ? "default" : "outline"}>{fund.isOpen ? "Open" : "Closed"}</Badge></td><td className="px-4 py-4">{fund.total}</td><td className="px-4 py-4">{money(fund.committedCents)}</td><td className="px-4 py-4">{money(fund.receivedCents)}</td><td className="px-4 py-4"><div className="flex items-center gap-2"><div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${setup?.percent ?? 0}%` }} /></div><span className="text-xs">{setup?.percent ?? 0}%</span></div></td><td className="px-4 py-4"><span className={fund.openFlags > 0 ? "text-destructive" : "text-muted-foreground"}>{next}</span></td><td className="px-4 py-4 text-right"><Button asChild size="sm" variant="ghost"><Link to="/manager/fund/$fundId" params={{ fundId: fund.id }}>Open <ArrowUpRight className="ml-1 h-4 w-4" /></Link></Button></td></tr>; })}{funds.length === 0 ? <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No funds match these filters.</td></tr> : null}</tbody></table></div></CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2"><FundInvitations title="Invite people to a fund" /><Card><CardHeader><CardTitle className="text-base">Email alerts</CardTitle><CardDescription>Choose which fund activity reaches your inbox.</CardDescription></CardHeader><CardContent><AlertPreferenceToggle /></CardContent></Card></div>
    </main>
  );
}

function Metric({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) { return <div className="bg-card px-4 py-4"><p className="text-xs text-muted-foreground">{label}</p><p className={alert ? "mt-1 text-2xl font-medium text-destructive" : "mt-1 text-2xl font-medium"}>{value}</p></div>; }