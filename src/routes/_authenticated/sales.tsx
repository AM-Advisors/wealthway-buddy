import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { decidePricingRequest, getSalesOverview, priceFund, saveClientPricing } from "@/lib/commercial-pricing.functions";
import { COMMERCIAL_STATUS_LABEL } from "@/lib/commercial-pricing";
import { SalesOverviewTab } from "@/components/sales-overview-tab";
import { SalesPipelineTab } from "@/components/sales-pipeline-tab";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({
    meta: [
      { title: "Sales - Harmonious" },
      { name: "description", content: "Harmonious Sales: clients, fund requests, fund pricing, pricing approvals, Client Pricing and pricing history." },
      { property: "og:title", content: "Sales - Harmonious" },
      { property: "og:description", content: "Commercial pricing and agreements for Harmonious staff." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SalesPage,
});

const money = (c: number | null | undefined) => (c == null ? "-" : `$${(Number(c) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
const statusLabel = (s: string) => COMMERCIAL_STATUS_LABEL[s as keyof typeof COMMERCIAL_STATUS_LABEL] ?? s;

function SalesPage() {
  const load = useServerFn(getSalesOverview);
  const q = useQuery({ queryKey: ["sales-overview"], queryFn: () => load(), retry: false });
  if (q.error) return <main className="mx-auto max-w-5xl px-4 py-10"><h1 className="text-3xl">Sales</h1><p className="mt-4 text-sm text-muted-foreground">{(q.error as Error).message}</p></main>;
  const d = q.data as any;
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl">Sales</h1>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">Commercial information only. Nothing here pauses a fund, its setup or its investors.</p>
      {!d ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <Tabs defaultValue="overview">
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="requests">Fund Requests</TabsTrigger>
            <TabsTrigger value="funds">Pricing</TabsTrigger>
            <TabsTrigger value="approvals">Pricing Approvals</TabsTrigger>
            <TabsTrigger value="client-pricing">Commercial Agreements</TabsTrigger>
            <TabsTrigger value="history">Pricing History</TabsTrigger>
          </TabsList>
          <TabsContent value="overview"><SalesOverviewTab /></TabsContent>
          <TabsContent value="pipeline"><SalesPipelineTab /></TabsContent>
          <TabsContent value="clients"><Rows items={d.clients} render={(c: any) => (<><span>{c.name} <span className="text-xs text-muted-foreground">· {c.funds} funds</span></span>{c.msaFollowUp ? <Badge variant="outline">MSA Follow-Up Required</Badge> : <Badge variant="secondary">MSA on file</Badge>}</>)} /></TabsContent>
          <TabsContent value="requests"><Rows items={d.fundRequests} empty="No fund requests." render={(r: any) => (<><span>{r.name} <span className="text-xs text-muted-foreground">· {r.clientName ?? "No client"}</span></span><Badge variant="outline">{r.status}</Badge></>)} /></TabsContent>
          <TabsContent value="funds"><FundPricing d={d} /></TabsContent>
          <TabsContent value="approvals"><Approvals d={d} /></TabsContent>
          <TabsContent value="client-pricing"><ClientPricing d={d} /></TabsContent>
          <TabsContent value="history"><Rows items={d.history} empty="No snapshots yet." render={(s: any) => (<><span>{s.fundName} <span className="text-xs text-muted-foreground">· {s.source} · {new Date(s.created_at).toLocaleDateString("en-US")}{s.superseded_at ? " · superseded" : ""}</span></span><span className="text-right">{money(s.final_total_cents)} <Badge variant="outline">{statusLabel(s.status)}</Badge></span></>)} /></TabsContent>
        </Tabs>
      )}
    </main>
  );
}

function Rows({ items, render, empty = "Nothing here yet." }: { items: any[]; render: (x: any) => React.ReactNode; empty?: string }) {
  if (!items?.length) return <p className="py-4 text-sm text-muted-foreground">{empty}</p>;
  return <ul className="divide-y text-sm">{items.map((x, i) => <li key={x.id ?? i} className="flex flex-wrap items-center justify-between gap-2 py-2">{render(x)}</li>)}</ul>;
}

function FundPricing({ d }: { d: any }) {
  const qc = useQueryClient();
  const save = useServerFn(priceFund);
  const [fundId, setFundId] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => save({ data: { offeringId: fundId, reason: reason || undefined, prices: Object.fromEntries(Object.entries(prices).filter(([, v]) => v !== "").map(([k, v]) => [k, Math.round(Number(v) * 100)])) } }),
    onSuccess: (r: any) => { toast.success(r.status === "approved" ? "Pricing approved." : "Below baseline - sent for pricing approval."); setPrices({}); void qc.invalidateQueries({ queryKey: ["sales-overview"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });
  return (
    <div className="space-y-6">
      <Rows items={d.funds} render={(f: any) => (<><span>{f.name} <span className="text-xs text-muted-foreground">· {f.clientName ?? "No client"}</span></span><span>{money(f.finalTotalCents)} <Badge variant="outline">{statusLabel(f.status)}</Badge></span></>)} />
      <div className="space-y-3 rounded-md border p-4">
        <h2 className="text-lg">Set a fund's pricing</h2>
        <p className="text-xs text-muted-foreground">Only for funds with no investors yet. At or above the baseline is approved immediately; below it goes to Sales Management.</p>
        <Select value={fundId} onValueChange={setFundId}><SelectTrigger className="max-w-md"><SelectValue placeholder="Choose a fund" /></SelectTrigger>
          <SelectContent>{d.funds.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent></Select>
        <div className="grid gap-2 sm:grid-cols-2">
          {d.catalog.filter((l: any) => !l.passThrough).map((l: any) => (
            <div key={l.serviceKey}><Label className="text-xs">{l.label} (rate card {money(l.catalogCents)})</Label>
              <Input inputMode="decimal" placeholder="Leave blank for baseline" value={prices[l.serviceKey] ?? ""} onChange={(e) => setPrices({ ...prices, [l.serviceKey]: e.target.value })} /></div>
          ))}
        </div>
        <Input placeholder="Reason (required for a discount)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button disabled={!fundId || m.isPending} onClick={() => m.mutate()}>Save pricing</Button>
      </div>
    </div>
  );
}

function Approvals({ d }: { d: any }) {
  const qc = useQueryClient();
  const decide = useServerFn(decidePricingRequest);
  const [reason, setReason] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: (v: { requestId: string; approve: boolean; scope?: "fund_only" | "client_future" }) => decide({ data: { ...v, reason: reason[v.requestId] ?? "" } }),
    onSuccess: () => { toast.success("Decision recorded."); void qc.invalidateQueries({ queryKey: ["sales-overview"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not decide."),
  });
  if (!d.approvals.length) return <p className="py-4 text-sm text-muted-foreground">No pricing requests.</p>;
  return (
    <ul className="space-y-3">
      {d.approvals.map((r: any) => (
        <li key={r.id} className="rounded-md border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{r.fundName} · {r.clientName ?? "No client"}</span><Badge variant="outline">{r.status}</Badge></div>
          <ul className="mt-2 text-xs text-muted-foreground">{(r.lines ?? []).map((l: any) => <li key={l.serviceKey}>{l.label}: baseline {money(l.baselineCents)} → requested {money(l.finalCents)}</li>)}</ul>
          {r.reason ? <p className="mt-1 text-xs">Reason: {r.reason}</p> : null}
          {r.status === "pending" && d.canApprove && r.requested_by !== d.me ? (
            <div className="mt-3 space-y-2">
              <Input placeholder="Decision reason" value={reason[r.id] ?? ""} onChange={(e) => setReason({ ...reason, [r.id]: e.target.value })} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={m.isPending} onClick={() => m.mutate({ requestId: r.id, approve: true, scope: "fund_only" })}>Approve - This Fund Only</Button>
                <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate({ requestId: r.id, approve: true, scope: "client_future" })}>Approve - Client Pricing, Future Funds</Button>
                <Button size="sm" variant="ghost" disabled={m.isPending} onClick={() => m.mutate({ requestId: r.id, approve: false })}>Decline</Button>
              </div>
            </div>
          ) : r.status === "pending" ? <p className="mt-2 text-xs text-muted-foreground">{r.requested_by === d.me ? "You requested this - another approver must decide." : "Waiting for Sales Management."}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function ClientPricing({ d }: { d: any }) {
  const qc = useQueryClient();
  const save = useServerFn(saveClientPricing);
  const [f, setF] = useState({ clientId: "", serviceKey: "", price: "", effectiveDate: new Date().toISOString().slice(0, 10), expiresOn: "", reason: "" });
  const m = useMutation({
    mutationFn: () => save({ data: { clientId: f.clientId, serviceKey: f.serviceKey, priceCents: Math.round(Number(f.price) * 100), effectiveDate: f.effectiveDate, expiresOn: f.expiresOn, reason: f.reason } }),
    onSuccess: () => { toast.success("Client Pricing saved for future funds."); void qc.invalidateQueries({ queryKey: ["sales-overview"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });
  return (
    <div className="space-y-6">
      <Rows items={d.clientPricing} empty="No Client Pricing." render={(p: any) => (<><span>{p.clientName} · {p.label}<span className="block text-xs text-muted-foreground">From {p.effective_date ?? "-"}{p.expires_on ? ` to ${p.expires_on}` : ""}{p.approval_reason ? ` · ${p.approval_reason}` : ""}</span></span><span>{money(p.contracted_cents)} <span className="text-xs text-muted-foreground">(rate card {money(p.standard_cents)})</span>{p.superseded_at ? <Badge variant="outline" className="ml-2">Superseded</Badge> : null}</span></>)} />
      {d.canApprove ? (
        <div className="grid gap-2 rounded-md border p-4 sm:grid-cols-2">
          <h2 className="text-lg sm:col-span-2">Set Client Pricing for future funds</h2>
          <Select value={f.clientId} onValueChange={(v) => setF({ ...f, clientId: v })}><SelectTrigger><SelectValue placeholder="Client" /></SelectTrigger><SelectContent>{d.clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
          <Select value={f.serviceKey} onValueChange={(v) => setF({ ...f, serviceKey: v })}><SelectTrigger><SelectValue placeholder="Service" /></SelectTrigger><SelectContent>{d.catalog.filter((l: any) => !l.passThrough).map((l: any) => <SelectItem key={l.serviceKey} value={l.serviceKey}>{l.label}</SelectItem>)}</SelectContent></Select>
          <Input inputMode="decimal" placeholder="Price ($)" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
          <Input type="date" value={f.effectiveDate} onChange={(e) => setF({ ...f, effectiveDate: e.target.value })} />
          <Input type="date" placeholder="Expires (optional)" value={f.expiresOn} onChange={(e) => setF({ ...f, expiresOn: e.target.value })} />
          <Input placeholder="Reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          <Button className="sm:col-span-2" disabled={!f.clientId || !f.serviceKey || !f.price || m.isPending} onClick={() => m.mutate()}>Save Client Pricing</Button>
        </div>
      ) : <p className="text-xs text-muted-foreground">Client Pricing is set by Sales Management or a Super User.</p>}
    </div>
  );
}
