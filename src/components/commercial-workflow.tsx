import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getCommercialWorkflow, qualifyCommercialInquiry, linkCommercialImport } from "@/lib/commercial-workflow.functions";
import { commercialAreas } from "@/lib/commercial-workflow-model";

export type CommercialWorkflowData = {
  areas: ReturnType<typeof commercialAreas>; inquiries: any[]; team: any[]; canQualify: boolean;
  finance: any; accountManagement: any; commissions: any; asOf: string; importReviews?: any[];
};
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
export function CommercialWorkflow() {
  const load = useServerFn(getCommercialWorkflow);
  const qualify = useServerFn(qualifyCommercialInquiry);
  const linkImport = useServerFn(linkCommercialImport);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["commercial-workflow"], queryFn: () => load(), retry: false });
  if (query.isPending) return <main className="p-6">Loading team workflow…</main>;
  if (query.isError) return <main className="space-y-3 p-6" role="alert"><p>{query.error.message}</p><Button variant="outline" onClick={() => query.refetch()}><RefreshCw className="size-4" />Retry</Button></main>;
  return <CommercialWorkflowView data={query.data} onLinkImport={async input => { await linkImport({ data: input }); await qc.invalidateQueries({ queryKey: ["commercial-workflow"] }); }} onRefresh={() => query.refetch()} onQualify={async input => { await qualify({ data: input }); await qc.invalidateQueries({ queryKey: ["commercial-workflow"] }); }} />;
}
export function CommercialWorkflowView({ data, onRefresh, onQualify, onLinkImport }: { data: CommercialWorkflowData; onRefresh?: () => unknown; onQualify?: (input: { leadId: string; ownerId: string; contactId?: string | undefined }) => Promise<unknown>; onLinkImport?: ((input: { reviewId: string; contactId: string }) => Promise<unknown>) | undefined }) {
  const [filter, setFilter] = useState("");
  const matches = (value: string) => value.toLowerCase().includes(filter.toLowerCase());
  const commissionRows = data.commissions?.rows ?? [];
  const expected = commissionRows.filter((r: any) => r.status === "expected").reduce((sum: number, r: any) => sum + Number(r.amountCents), 0);
  const earned = commissionRows.filter((r: any) => r.paid && r.status !== "cancelled").reduce((sum: number, r: any) => sum + Number(r.amountCents), 0);
  return <main className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase text-muted-foreground">Harmonious teams</p><h1 className="font-heading text-3xl">Client and revenue workflow</h1><p className="mt-2 text-xs text-muted-foreground">As of {new Date(data.asOf).toLocaleString()}</p></div>{onRefresh && <Button variant="outline" size="icon" aria-label="Refresh workflow" onClick={onRefresh}><RefreshCw className="size-4" /></Button>}</header>
    <nav aria-label="Team work areas" className="flex flex-wrap items-center gap-3 border-y py-4 text-sm">
      {data.areas.marketing && <Link to="/marketing" className="font-medium text-primary hover:underline">Marketing</Link>}
      {data.areas.sales && <><ArrowRight className="size-4 text-muted-foreground" /><Link to="/sales" className="font-medium text-primary hover:underline">Sales pipeline</Link><Link to="/sales/documents" className="text-primary hover:underline">Quotes and agreements</Link></>}
      {data.areas.accountManagement && <><ArrowRight className="size-4 text-muted-foreground" /><Link to="/account-manager/handoffs" className="font-medium text-primary hover:underline">Account Management</Link></>}
      {data.areas.finance && <><ArrowRight className="size-4 text-muted-foreground" /><Link to="/ops/billing/invoices" className="font-medium text-primary hover:underline">Invoices and payment preparation</Link><Link to="/ops/command-center" className="text-primary hover:underline">Work and approvals</Link></>}
      {data.areas.feeReview && <Link to="/ops/accounting" search={{ tab: "fees" }} className="font-medium text-primary hover:underline">Fee accounting review</Link>}
    </nav>
    <Input aria-label="Filter workflow" placeholder="Find a company, client or invoice" value={filter} onChange={e => setFilter(e.target.value)} className="max-w-md" />
    {data.finance && <section className="space-y-4" aria-label="Recorded invoice money"><h2 className="font-heading text-xl">Invoices and recorded payments</h2><div className="grid gap-4 sm:grid-cols-3"><Metric label="Recorded receipts, 12 months" value={money(data.finance.totals.revenue12m)} /><Metric label="Outstanding invoice balances" value={money(data.finance.totals.outstanding)} /><Metric label="Overdue balances" value={money(data.finance.totals.overdue)} /></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Invoice", "Client", "Due", "Status", "Billed", "Received", "Remaining"].map(label => <th key={label} className="border-b py-2 pr-4 font-medium text-muted-foreground">{label}</th>)}</tr></thead><tbody>{data.finance.invoices.filter((i: any) => matches(`${i.number} ${i.client}`)).map((i: any) => <tr key={i.id}><td className="border-b py-3 pr-4"><Link to="/ops/billing/invoices" className="text-primary hover:underline">{i.number ?? "Draft"}</Link></td><td className="border-b py-3 pr-4">{i.client}</td><td className="whitespace-nowrap border-b py-3 pr-4">{i.due ?? "Not set"}</td><td className="border-b py-3 pr-4"><Badge variant={i.status === "overdue" ? "destructive" : "outline"}>{i.status.replace(/_/g, " ")}</Badge></td>{[i.cents, i.receivedCents, i.remainingCents].map((value, index) => <td key={index} className="whitespace-nowrap border-b py-3 pr-4 tabular-nums">{money(Number(value ?? 0))}</td>)}</tr>)}</tbody></table></div></section>}
    {data.commissions && <section className="space-y-4" aria-label="Commission projections"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-heading text-xl">Commissions</h2><Link to="/sales/commissions" className="text-sm text-primary hover:underline">Open commission schedule and recorded payouts</Link></div><div className="grid gap-4 sm:grid-cols-2"><Metric label="Expected, unpaid projections" value={money(expected)} /><Metric label="Earned from paid invoices" value={money(earned)} /></div></section>}
    {data.accountManagement && <section className="space-y-3"><h2 className="font-heading text-xl">Client handoffs and fund forecasts</h2><ul className="divide-y">{data.accountManagement.handoffs.filter((h: any) => matches(`${h.client} ${h.title}`)).map((h: any) => <li key={h.id} className="flex flex-wrap justify-between gap-3 py-4"><div><p className="font-medium">{h.client}</p><p className="text-sm text-muted-foreground">{h.quote} · {h.title} · {money(h.cents)}</p><Badge variant={h.needsReview ? "destructive" : "outline"}>{h.needsReview ? "Handoff needs review" : h.handedOff ? "Fund linked" : "Handoff pending"}</Badge></div><div className="flex flex-wrap items-center gap-3 text-sm text-primary">{data.areas.sales && <Link to="/sales/quotes/$id" params={{ id: h.id }} className="hover:underline">Quote</Link>}{h.fundId && <><Link to="/ops/fund/$fundId" params={{ fundId: h.fundId }} className="hover:underline">Fund and team</Link><Link to="/ops/fund/$fundId" params={{ fundId: h.fundId }} search={{ tab: "forecasts" }} className="hover:underline">Forecasts</Link>{data.areas.finance && <Link to="/admin/fund-payments/$fundId" params={{ fundId: h.fundId }} className="hover:underline">Payment review</Link>}</>}</div></li>)}</ul>{!data.accountManagement.handoffs.length && <p className="text-sm text-muted-foreground">No recent or unresolved client handoffs.</p>}</section>}
    {data.canQualify && <section className="space-y-3"><h2 className="font-heading text-xl">Incoming inquiries</h2>{data.inquiries.filter(i => matches(`${i.name} ${i.company}`)).map(i => <Inquiry key={i.id} inquiry={i} team={data.team} onQualify={onQualify} />)}{!data.inquiries.length && <p className="text-sm text-muted-foreground">No inquiries awaiting qualification in this view.</p>}</section>}
    {!!data.importReviews?.length && <section className="space-y-3"><h2 className="font-heading text-xl">Imported contact matches</h2>{data.importReviews.map(r => <ImportMatch key={r.id} review={r} onLink={onLinkImport} />)}</section>}
  </main>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="border-l-2 border-primary pl-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></div>; }
function Inquiry({ inquiry, team, onQualify }: { inquiry: any; team: any[]; onQualify?: ((input: { leadId: string; ownerId: string; contactId?: string | undefined }) => Promise<unknown>) | undefined }) {
  const [ownerId, setOwnerId] = useState("");
  const [contactId, setContactId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="flex flex-wrap items-center justify-between gap-4 border-b py-4"><div className="min-w-0"><p className="font-medium">{inquiry.company}</p><p className="break-words text-sm">{inquiry.name} · {inquiry.work_email}</p><p className="text-xs text-muted-foreground">{inquiry.intent.replace(/_/g, " ")} · {inquiry.utm_campaign ?? "Website"}</p>{error && <p role="alert" className="mt-2 max-w-lg text-sm text-destructive">{error}</p>}</div><div className="flex flex-wrap items-center gap-2">{!!inquiry.candidates?.length && <SearchableSelect aria-label="Existing contact" className="w-60" value={contactId} onValueChange={setContactId} placeholder="Review matching contact" options={inquiry.candidates.map((c: any) => ({ value: c.id, label: `${c.full_name} · ${c.email}` }))} />}<SearchableSelect aria-label={`Sales owner for ${inquiry.company}`} className="w-48" value={ownerId} onValueChange={setOwnerId} placeholder="Sales owner" options={team.map(t => ({ value: t.id, label: t.name }))} /><Button disabled={busy || !ownerId || !onQualify || (!!inquiry.candidates?.length && !contactId)} onClick={async () => { if (!onQualify) return; setBusy(true); setError(""); try { await onQualify({ leadId: inquiry.id, ownerId, ...(contactId ? { contactId } : {}) }); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't qualify inquiry."); } finally { setBusy(false); } }}>Qualify and assign</Button></div></div>;
}
function ImportMatch({ review, onLink }: { review: any; onLink?: ((input: { reviewId: string; contactId: string }) => Promise<unknown>) | undefined }) {
  const [id, setId] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <div className="flex flex-wrap items-center gap-3 border-b py-4"><p className="break-all text-sm">{review.email}</p><SearchableSelect aria-label="Imported contact match" className="w-64" value={id} onValueChange={setId} placeholder="Review existing contact" options={review.candidates.map((c: any) => ({ value: c.id, label: `${c.full_name} · ${c.email}` }))} /><Button disabled={!id || busy || !onLink} onClick={async () => { if (!onLink) return; setBusy(true); try { await onLink({ reviewId: review.id, contactId: id }); } catch(e) { setError(e instanceof Error ? e.message : "Couldn't link contact."); } finally { setBusy(false); } }}>Link recorded source</Button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>;
}