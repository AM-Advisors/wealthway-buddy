import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Search } from "lucide-react";

import { getManagerPanelSummary } from "@/lib/manager.functions";
import { getMyFundRequests } from "@/lib/self-service.functions";
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
      { title: "Your Funds — Harmonious" },
      { name: "description", content: "Portfolio status, capital, investor activity, approvals, and exceptions across the funds you manage." },
      { property: "og:title", content: "Your Funds — Harmonious" },
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
  const loadRequests = useServerFn(getMyFundRequests);
  const myRequests = useQuery({ queryKey: ["my-fund-requests"], queryFn: () => loadRequests() });
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

  const requests = (myRequests.data?.requests ?? []).filter((r: any) => !r.offeringId || !all.some((f) => f.id === r.offeringId));
  const addInvestorTarget = all.length === 1 ? all[0] : null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-3xl">Your Funds</h1><p className="mt-2 text-sm text-muted-foreground">{all.length} {all.length === 1 ? "fund" : "funds"} · {money(totals.committed)} committed · {money(totals.received)} received</p></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild size="lg"><Link to="/manager/request-fund">+ Request New Fund / SPV</Link></Button>
          {addInvestorTarget
            ? <Button asChild size="lg" variant="outline"><Link to="/manager/fund/$fundId/investors" params={{ fundId: addInvestorTarget.id }}>+ Add Investor</Link></Button>
            : <Button asChild size="lg" variant="outline"><Link to="/manager/funds">+ Add Investor</Link></Button>}
        </div>
      </div>

      {requests.length > 0 && (
        <section className="mt-6">
          <h2 className="text-base font-medium">Being set up</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {requests.map((r: any) => (
              <Card key={r.id}><CardContent className="flex items-center justify-between gap-3 pt-6">
                <div className="min-w-0"><p className="truncate font-medium">{r.fundName}</p><Badge variant="outline" className="mt-1">{r.lifecycle}</Badge></div>
                <Button asChild size="sm" variant="outline"><Link to="/manager/fund-setup/$requestId" params={{ requestId: r.id }}>View setup</Link></Button>
              </CardContent></Card>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-[1fr,auto]">
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search funds" /></div>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="sm:w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent></Select>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {funds.map((fund: any) => {
          const setup = progressOf(fund.id);
          const outstanding = fund.openFlags + fund.pendingWires + fund.identity + fund.accreditation + fund.documents;
          return (
            <Card key={fund.id} className="flex min-w-0 flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><CardTitle className="truncate text-lg">{fund.name}</CardTitle><CardDescription>{fund.fundType ? prettyStatus(fund.fundType) : "Fund"}</CardDescription></div>
                  <Badge variant={fund.isOpen ? "default" : "outline"}>{fund.isOpen ? "Operating" : "Closed"}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3 text-sm">
                <dl className="grid grid-cols-2 gap-2">
                  <div><dt className="text-xs text-muted-foreground">Investors</dt><dd className="font-medium">{fund.total}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Committed</dt><dd className="font-medium">{money(fund.committedCents)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Received</dt><dd className="font-medium">{money(fund.receivedCents)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Setup</dt><dd className="font-medium">{setup?.percent ?? 0}%</dd></div>
                </dl>
                <p className={outstanding > 0 ? "text-destructive" : "text-muted-foreground"}>{outstanding > 0 ? `${outstanding} outstanding ${outstanding === 1 ? "action" : "actions"}` : "Nothing outstanding"}</p>
                <Button asChild className="mt-auto w-full"><Link to="/manager/fund/$fundId" params={{ fundId: fund.id }}>Manage Fund <ArrowUpRight className="ml-1 h-4 w-4" /></Link></Button>
              </CardContent>
            </Card>
          );
        })}
        {funds.length === 0 ? <p className="text-sm text-muted-foreground">{all.length ? "No funds match these filters." : "No funds yet — request your first fund or SPV above."}</p> : null}
      </div>

      <div className="mt-8"><AttentionCenter workspace="fund_manager" /></div>

      <div className="mt-6 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2"><FundInvitations title="Invite people to a fund" /><Card><CardHeader><CardTitle className="text-base">Email alerts</CardTitle><CardDescription>Choose which fund activity reaches your inbox.</CardDescription></CardHeader><CardContent><AlertPreferenceToggle /></CardContent></Card></div>
    </main>
  );
}
