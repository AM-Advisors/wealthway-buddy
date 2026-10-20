import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getBillingPipeline } from "@/lib/ops-billing.functions";

const money = (c: number) => `$${(Number(c ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const label = (s?: string | null) => (s ? s.replace(/_/g, " ") : "—");

export function useBillingPipeline() {
  const load = useServerFn(getBillingPipeline);
  return useQuery({ queryKey: ["ops-billing-pipeline"], queryFn: () => load() });
}

export function BillingPipeline({ view }: { view: "sows" | "invoices" }) {
  const q = useBillingPipeline();
  const [search, setSearch] = useState("");
  const rows = useMemo(
    () => ((q.data as any)?.quotes ?? []).filter((r: any) => !search || `${r.clientName} ${r.number} ${r.title ?? ""}`.toLowerCase().includes(search.toLowerCase())),
    [q.data, search],
  );
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading signed quotes…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  return (
    <div className="space-y-4">
      <Input placeholder="Search client or quote number" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      {rows.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No signed quotes yet. When a client signs a quote in <Link to="/sales/quotes" className="underline">Sales → Quotes</Link>, it starts here.
        </CardContent></Card>
      ) : rows.map((r: any) => (
        <Card key={r.id}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg">{r.clientName}</CardTitle>
                <CardDescription>
                  <Link to="/sales/quotes/$id" params={{ id: r.id }} className="underline">Quote {r.number} v{r.version}</Link>
                  {" · "}signed {r.signedAt ? new Date(r.signedAt).toLocaleDateString() : "—"} · {money(r.totalCents)}
                </CardDescription>
              </div>
              <Badge variant="secondary">Signed quote</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!r.sow ? (
              <p className="text-muted-foreground">No statement of work yet. Open the quote and draft the agreements.</p>
            ) : view === "sows" ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <span className="font-medium">{r.sow.title ?? "Statement of work"}</span>
                  <Badge variant="outline">Status: {label(r.sow.status)}</Badge>
                  <Badge variant="outline">Harmonious approval: {label(r.sow.approval_status)}</Badge>
                  <Badge variant="outline">Client: {r.sow.client_signed_at ? `signed ${new Date(r.sow.client_signed_at).toLocaleDateString()}` : label(r.sow.client_status)}</Badge>
                </div>
                {r.schedules.length ? (
                  <table className="w-full text-left">
                    <thead className="text-muted-foreground"><tr><th>Service</th><th>Billed</th><th>Amount</th><th>Next bill</th></tr></thead>
                    <tbody>{r.schedules.map((s: any, i: number) => (
                      <tr key={i} className="border-t"><td>{s.label}</td><td className="capitalize">{label(s.frequency)}</td><td>{money(s.amount_cents)}</td><td>{s.active ? s.next_due_on ?? "—" : "Finished"}</td></tr>
                    ))}</tbody>
                  </table>
                ) : <p className="text-muted-foreground">Billing schedule starts once the statement of work is signed and approved.</p>}
                <Link to="/ops/agreements" className="underline">Open in Agreements</Link>
              </>
            ) : r.invoices.length ? (
              <table className="w-full text-left">
                <thead className="text-muted-foreground"><tr><th>Invoice</th><th>Period</th><th>Status</th><th>Amount</th><th>Due</th></tr></thead>
                <tbody>{r.invoices.map((i: any) => (
                  <tr key={i.id} className="border-t">
                    <td>{i.number ?? "Draft"}{i.generated_by_schedule ? " · scheduled" : ""}</td>
                    <td>{i.period_start ? `${i.period_start} – ${i.period_end ?? ""}` : "—"}</td>
                    <td className="capitalize">{label(i.status)}{i.status === "issued" ? ` · ${label(i.approval_status)}` : ""}</td>
                    <td>{money(i.total_cents)}</td>
                    <td>{i.paid_at ? `Paid ${new Date(i.paid_at).toLocaleDateString()}` : i.due_date ?? "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p className="text-muted-foreground">No invoices yet. Drafts appear on each billing date.</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
