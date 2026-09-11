import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "—";
  return `$${(Number(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function when(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const REQUEST_STATE: Record<string, string> = {
  requested: "Waiting on Harmonious to review it",
  in_review: "Harmonious is reviewing it",
  quoted: "Waiting on your signature",
  signed: "Signed — waiting to be switched on",
};

const OPEN_REQUESTS = ["requested", "in_review", "quoted", "signed"];
const OPEN_INVOICES = ["issued", "approved", "partially_paid", "overdue"];

type Props = {
  funds: any[];
  invoices: any[];
  payments: any[];
  wireRequests: any[];
  serviceRequests: any[];
  services: any[];
};

/** One place for the client: fund status, open asks, fees agreed and money in flight. */
export function ClientDashboard({
  funds,
  invoices,
  payments,
  wireRequests,
  serviceRequests,
  services,
}: Props) {
  const openInvoices = (invoices ?? []).filter((i: any) => OPEN_INVOICES.includes(i.status));
  const approvedInvoices = (invoices ?? []).filter(
    (i: any) => i.client_approved_at || i.status === "approved",
  );
  const openRequests = (serviceRequests ?? []).filter((r: any) =>
    OPEN_REQUESTS.includes(r.status),
  );
  const openWires = (wireRequests ?? []).filter(
    (w: any) => !["settled", "cancelled", "declined", "rejected"].includes(w.status),
  );
  const movingPayments = (payments ?? []).filter(
    (p: any) => !["settled", "cancelled", "failed", "returned"].includes(p.status),
  );

  const owed = openInvoices.reduce((sum: number, i: any) => sum + Number(i.total_cents ?? 0), 0);
  const approvedTotal = approvedInvoices.reduce(
    (sum: number, i: any) => sum + Number(i.total_cents ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open funds</CardDescription>
            <CardTitle className="text-2xl">
              {funds.filter((f: any) => f.is_open).length}
              <span className="text-base text-muted-foreground"> of {funds.length}</span>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Requests with us</CardDescription>
            <CardTitle className="text-2xl">{openRequests.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Fees you've approved</CardDescription>
            <CardTitle className="text-2xl">{money(approvedTotal)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Still to pay</CardDescription>
            <CardTitle className="text-2xl">{money(owed)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your funds</CardTitle>
            <CardDescription>
              Where each fund stands and how many services sit in your active scope.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {funds.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No funds are attached to your engagement yet.
              </p>
            )}
            {funds.map((f: any) => {
              const inScope = (services ?? []).filter(
                (s: any) => !s.offeringId || s.offeringId === f.id,
              ).length;
              return (
                <div key={f.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{f.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.reg_type ? `Reg D ${f.reg_type}` : "Exemption not recorded"} ·{" "}
                        {inScope} services in scope
                      </p>
                    </div>
                    <Badge variant={f.is_open ? "default" : "secondary"}>
                      {f.is_open ? "Open" : "Closed"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Requests in progress</CardTitle>
            <CardDescription>
              Services you've asked for that aren't part of your active scope yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {openRequests.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing is waiting with us right now.</p>
            )}
            {openRequests.map((r: any) => (
              <div key={r.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{r.serviceName}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.fundName ? `${r.fundName} · ` : ""}
                      {REQUEST_STATE[r.status] ?? r.status} · asked {when(r.created_at)}
                    </p>
                  </div>
                  {r.proposed_fee_cents ? (
                    <Badge variant="outline">{money(r.proposed_fee_cents)}</Badge>
                  ) : r.proposed_pricing_model === "per_request" ? (
                    <Badge variant="outline">Quoted per request</Badge>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invoices to look at</CardTitle>
            <CardDescription>Approve, query or tell us you've sent payment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {openInvoices.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing is outstanding.</p>
            )}
            {openInvoices.slice(0, 5).map((i: any) => (
              <div key={i.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{i.invoice_number ?? "Invoice"}</p>
                  <p className="text-xs text-muted-foreground">
                    {i.due_date ? `Due ${when(i.due_date)}` : "No due date"} ·{" "}
                    {i.client_approved_at ? "Approved by you" : "Awaiting your approval"}
                  </p>
                </div>
                <p className="text-sm font-medium">{money(i.total_cents)}</p>
              </div>
            ))}
            <Button asChild size="sm" variant="outline">
              <Link to="/client/invoices">View and pay invoices</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Money in flight</CardTitle>
            <CardDescription>
              Harmonious facilitates payments and keeps the records; two authorised people check
              every movement before funds leave.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {movingPayments.length === 0 && openWires.length === 0 && (
              <p className="text-sm text-muted-foreground">No payments are in progress.</p>
            )}
            {movingPayments.slice(0, 5).map((p: any) => (
              <div key={p.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{p.purpose ?? "Payment"}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.fundName ? `${p.fundName} · ` : ""}
                    {String(p.status).replace(/_/g, " ")}
                  </p>
                </div>
                <p className="text-sm font-medium">{money(p.amount_cents)}</p>
              </div>
            ))}
            {openWires.slice(0, 5).map((w: any) => (
              <div key={w.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Wire request</p>
                  <p className="text-xs text-muted-foreground">
                    {w.fundName ? `${w.fundName} · ` : ""}
                    {String(w.status).replace(/_/g, " ")}
                  </p>
                </div>
                <p className="text-sm font-medium">{money(w.amount_cents)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
