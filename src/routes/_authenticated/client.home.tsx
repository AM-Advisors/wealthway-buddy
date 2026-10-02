import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Briefcase, PieChart, Plus, Settings } from "lucide-react";

import { useClientPortal } from "@/components/client-portal-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getClientHome } from "@/lib/client-fund-request.functions";

export const Route = createFileRoute("/_authenticated/client/home")({
  head: () => ({
    meta: [
      { title: "Home - Harmonious client portal" },
      { name: "description", content: "Your funds, new fund requests, setup progress and what's waiting on you." },
      { property: "og:title", content: "Home - Harmonious client portal" },
      { property: "og:description", content: "Your funds, requests and setup progress at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientHome,
});

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function ClientHome() {
  const { data, clientId } = useClientPortal();
  const id = clientId ?? ((data?.client as any)?.id as string | undefined) ?? null;
  const load = useServerFn(getClientHome);
  const q = useQuery({ queryKey: ["client-home", id], enabled: !!id, queryFn: () => load({ data: { clientId: id! } }) });
  const invoices = ((data?.invoices ?? []) as any[]).filter((i) => i.status === "issued").length;
  const signoffs = (((data as any)?.serviceRequests ?? []) as any[]).filter((r) => r.status === "quoted").length;
  const h = q.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm"><Link to="/client/funds/new"><Plus className="mr-1 size-4" />Launch a new fund or SPV</Link></Button>
        <Button asChild size="sm" variant="outline"><Link to="/client/funds"><Briefcase className="mr-1 size-4" />Funds</Link></Button>
        <Button asChild size="sm" variant="outline"><Link to="/client/cap-table"><PieChart className="mr-1 size-4" />Cap Table</Link></Button>
        <Button asChild size="sm" variant="outline"><Link to="/client"><Settings className="mr-1 size-4" />Settings</Link></Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { l: "Funds", v: h ? String(h.totals.funds) : "-" },
          { l: "Open to investors", v: h ? String(h.totals.open) : "-" },
          { l: "Investors", v: h ? String(h.totals.investors) : "-" },
          { l: "Committed", v: h ? usd(h.totals.commitCents) : "-" },
          { l: "Funded (bank-matched)", v: h ? usd(h.totals.fundedCents) : "-" },
        ].map((k) => (
          <Card key={k.l}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{k.l}</p><p className="text-xl font-semibold">{k.v}</p></CardContent></Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">New fund requests</CardTitle><CardDescription>Funds and SPVs you've asked Harmonious to set up.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {!h?.requests.length && <p className="text-sm text-muted-foreground">No requests yet.</p>}
            {h?.requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <span className="font-medium">{r.name}</span>
                {r.status === "request_draft" ? (
                  <Button asChild size="sm" variant="outline"><Link to="/client/funds/new" search={{ draft: r.id }}>Continue draft</Link></Button>
                ) : r.offeringId ? (
                  <Link to="/client/funds/$fundId" params={{ fundId: r.offeringId }}><Badge variant="outline">Harmonious - pending review</Badge></Link>
                ) : (
                  <Badge variant="outline">{r.duplicate ? "Harmonious reviewing a possible duplicate" : "Harmonious - pending review"}</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Waiting on you</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Link to="/client/sign-offs" className="flex justify-between rounded-md border p-3 hover:bg-muted"><span>Sign-offs to review</span><Badge variant={signoffs ? "default" : "secondary"}>{signoffs}</Badge></Link>
            <Link to="/client/invoices" className="flex justify-between rounded-md border p-3 hover:bg-muted"><span>Invoices to pay</span><Badge variant={invoices ? "default" : "secondary"}>{invoices}</Badge></Link>
            <Link to="/client/inbox" className="flex justify-between rounded-md border p-3 hover:bg-muted"><span>Messages from Harmonious</span><span className="text-muted-foreground">Open</span></Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Fund setup progress</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {h && !h.funds.length && <p className="text-sm text-muted-foreground">No funds yet. Launch one above.</p>}
          {h?.funds.map((f) => (
            <Link key={f.id} to="/client/funds/$fundId" params={{ fundId: f.id }} className="block rounded-md border p-3 hover:bg-muted">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">{f.name}</span>
                <span className="flex items-center gap-2">
                  {f.harmoniousPending > 0 && <Badge variant="outline">Harmonious - {f.harmoniousPending} pending</Badge>}
                  <Badge variant={f.isOpen ? "default" : "secondary"}>{f.isOpen ? "Open" : "In setup"}</Badge>
                </span>
              </div>
              {f.percent != null && <div className="mt-2 flex items-center gap-3"><Progress value={f.percent} className="h-2" /><span className="text-xs text-muted-foreground">{f.percent}%</span></div>}
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
