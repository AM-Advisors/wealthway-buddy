import { Link } from "@tanstack/react-router";

import { separateSignedRecords } from "@/lib/client-portal-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientDueCalendar, type DueItem } from "@/components/client-due-calendar";
import { downloadStatement, openStatement } from "@/components/capital-statement-panel";

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
  sows?: any[];
  signedDocuments?: any[];
  statements?: any[];
};

function addDays(value: string, days: number) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** One place for the client: fund status, open asks, fees agreed and money in flight. */
export function ClientDashboard({
  funds,
  invoices,
  payments,
  wireRequests,
  serviceRequests,
  services,
  sows = [],
  signedDocuments = [],
  statements = [],
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

  const signedSows = (sows ?? []).filter((s: any) => s.client_signed_at || s.signed_on);

  // What Harmonious has decided recently, with the note the team left.
  const decisions: {
    id: string;
    label: string;
    outcome: string;
    note: string | null;
    at: string | null;
    tone: "good" | "plain";
  }[] = [
    ...(serviceRequests ?? [])
      .filter((r: any) => ["activated", "declined"].includes(r.status))
      .map((r: any) => ({
        id: `req-${r.id}`,
        label: `${r.serviceName ?? r.service_key} request`,
        outcome: r.status === "activated" ? "Approved" : "Declined",
        note: (r.declined_reason as string) ?? null,
        at: (r.updated_at as string) ?? null,
        tone: (r.status === "activated" ? "good" : "plain") as "good" | "plain",
      })),
    ...(wireRequests ?? [])
      .filter((w: any) => ["approved", "declined"].includes(w.status))
      .map((w: any) => ({
        id: `wire-${w.id}`,
        label: `${String(w.purpose ?? "Wire").replace(/_/g, " ")} request${w.fundName ? ` · ${w.fundName}` : ""}`,
        outcome: w.status === "approved" ? "Approved" : "Declined",
        note: (w.review_note as string) ?? null,
        at: (w.reviewed_at as string) ?? null,
        tone: (w.status === "approved" ? "good" : "plain") as "good" | "plain",
      })),
    ...(invoices ?? [])
      .filter((i: any) => i.dispute_resolution)
      .map((i: any) => ({
        id: `inv-${i.id}`,
        label: `Query on invoice ${i.number ?? ""}`.trim(),
        outcome: i.dispute_resolution === "accepted" ? "Being corrected" : "Invoice stands",
        note: (i.dispute_resolution_note as string) ?? null,
        at: (i.dispute_resolved_at as string) ?? null,
        tone: "plain" as const,
      })),
    ...(sows ?? [])
      .filter((s: any) => ["approved", "rejected"].includes(s.approval_status))
      .map((s: any) => ({
        id: `sow-${s.id}`,
        label: s.title ?? "Statement of work",
        outcome: s.approval_status === "approved" ? "Approved" : "Sent back",
        note: (s.approval_note as string) ?? null,
        at: (s.approved_at as string) ?? (s.updated_at as string) ?? null,
        tone: (s.approval_status === "approved" ? "good" : "plain") as "good" | "plain",
      })),
  ]
    .sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")))
    .slice(0, 6);

  const dueItems: DueItem[] = [];
  for (const inv of openInvoices) {
    if (!inv.due_date) continue;
    dueItems.push({
      id: `inv-${inv.id}`,
      date: String(inv.due_date).slice(0, 10),
      kind: "invoice",
      label: `${inv.number ?? inv.invoice_number ?? "Invoice"} due — ${money(inv.total_cents)}`,
      detail: inv.client_approved_at ? "Approved by you" : "Awaiting your approval",
    });
  }
  for (const r of openRequests) {
    const base = r.quoted_at ?? r.updated_at ?? r.created_at;
    const date = base ? addDays(String(base), r.status === "quoted" ? 10 : 5) : null;
    if (!date) continue;
    dueItems.push({
      id: `req-${r.id}`,
      date,
      kind: "request",
      label: `${r.serviceName} — ${REQUEST_STATE[r.status] ?? r.status}`,
      detail: r.fundName ?? null,
    });
  }
  for (const s of signedSows) {
    if (s.effective_date) {
      dueItems.push({
        id: `sow-eff-${s.id}`,
        date: String(s.effective_date).slice(0, 10),
        kind: "agreement",
        label: `${s.title ?? "Statement of work"} starts`,
        detail: null,
      });
    }
    if (s.termination_date) {
      dueItems.push({
        id: `sow-end-${s.id}`,
        date: String(s.termination_date).slice(0, 10),
        kind: "agreement",
        label: `${s.title ?? "Statement of work"} ends`,
        detail: s.notice_days ? `${s.notice_days} days' notice applies` : null,
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Actions (approve / pay invoices, sign fee proposals) come from the
          Action Center above — this page no longer calculates its own list. */}
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

      {decisions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Decisions from Harmonious</CardTitle>
            <CardDescription>What we've decided recently, and why.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {decisions.map((d) => (
              <div key={d.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{d.label}</p>
                    {d.note ? <p className="text-xs text-muted-foreground">{d.note}</p> : null}
                  </div>
                  <Badge variant={d.tone === "good" ? "default" : "secondary"}>{d.outcome}</Badge>
                </div>
                {d.at ? (
                  <p className="mt-1 text-xs text-muted-foreground">Decided {when(d.at)}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
                  <p className="text-sm font-medium">{i.number ?? i.invoice_number ?? "Invoice"}</p>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Signed agreements</CardTitle>
            <CardDescription>
              The statements of work you have signed, and where each one stands.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {signedSows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing is signed yet. Agreements appear here once you sign them.
              </p>
            )}
            {signedSows.map((s: any) => (
              <div key={s.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{s.title ?? "Statement of work"}</p>
                    <p className="text-xs text-muted-foreground">
                      Signed {when(s.client_signed_at ?? s.signed_on)}
                      {s.effective_date ? ` · starts ${when(s.effective_date)}` : ""}
                      {s.termination_date ? ` · ends ${when(s.termination_date)}` : ""}
                    </p>
                  </div>
                  <Badge variant={s.approval_status === "approved" ? "default" : "secondary"}>
                    {s.approval_status === "approved" ? "Approved" : "Awaiting approval"}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Signed documents</CardTitle>
            <CardDescription>
              Executed contracts and fund documents. Platform terms and policies are under Agreements & Policies.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {signedDocuments.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No executed documents yet. Signed contracts appear here automatically.
              </p>
            )}
            {separateSignedRecords(signedDocuments).documents.slice(0, 8).map((d: any) => (
              <div key={d.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium capitalize">{d.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.signedBy ? `${d.signedBy} · ` : ""}
                      {d.signedAt ? when(d.signedAt) : "Date not recorded"}
                    </p>
                  </div>
                  <Badge variant={d.kind === "agreement" ? "default" : "secondary"}>
                    {d.state}
                  </Badge>
                </div>
              </div>
            ))}
            {signedDocuments.length > 0 && (
              <Button asChild size="sm" variant="outline">
                <Link to="/client/sign-offs">Open sign-offs</Link>
              </Button>
            )}
            <Button asChild size="sm" variant="ghost">
              <Link to="/account/agreements">Agreements & Policies</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capital account statements</CardTitle>
            <CardDescription>
              Produced from each fund's records at a closing. Administrative records only — not a
              valuation, audit or tax document.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {statements.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No statements yet. They appear here once a closing is confirmed.
              </p>
            )}
            {statements.slice(0, 8).map((s: any) => (
              <div
                key={s.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.investorName ?? "Investor"}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.fundName ? `${s.fundName} · ` : ""}
                    {s.statement_date ? when(`${s.statement_date}T00:00:00`) : ""} ·{" "}
                    {money(s.snapshot?.contributedCents)} contributed
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => void openStatement(s)}>
                    View
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void downloadStatement(s)}>
                    Download
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <ClientDueCalendar items={dueItems} />
    </div>
  );
}
