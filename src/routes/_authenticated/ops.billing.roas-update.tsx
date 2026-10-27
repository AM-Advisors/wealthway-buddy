import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRoasBillingUpdate } from "@/lib/ops-billing.functions";
import { ROAS_FILING_FEES, roasFilingFeeRange } from "@/lib/roas-filing-fees";

export const Route = createFileRoute("/_authenticated/ops/billing/roas-update")({
  head: () => ({
    meta: [
      { title: "ROAS billing update | Harmonious Operations" },
      { name: "description", content: "ROAS draft terms, invoices, K-1 sets and filing-fee review in one staff-only place." },
      { property: "og:title", content: "ROAS billing update | Harmonious Operations" },
      { property: "og:description", content: "One read-only place for the current ROAS billing update." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RoasBillingUpdatePage,
});

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "Not set";

const label = (value?: string | null) => value ? value.replace(/_/g, " ") : "Not set";

function RoasBillingUpdatePage() {
  const load = useServerFn(getRoasBillingUpdate);
  const q = useQuery({ queryKey: ["roas-billing-update"], queryFn: () => load() });

  const copyUpdateLink = async () => {
    const url = `${window.location.origin}/ops/billing/roas-update`;
    await navigator.clipboard.writeText(url).catch(() => null);
    toast.success("ROAS billing update link copied");
  };

  const copyClientInvoiceLink = async (invoiceId: string) => {
    const url = `${window.location.origin}/client/invoices?invoice=${invoiceId}`;
    await navigator.clipboard.writeText(url).catch(() => null);
    toast.success("Client invoice link copied");
  };

  if (q.isPending) return <main className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted-foreground">Loading the ROAS billing update…</main>;
  if (q.error) return <main className="mx-auto max-w-6xl px-4 py-10 text-sm text-destructive">{(q.error as Error).message}</main>;

  const data = q.data;
  const filing = roasFilingFeeRange();
  const openInvoices = data.invoices.filter((invoice) => invoice.status === "issued");
  const outstandingCents = openInvoices.reduce((sum, invoice) => sum + invoice.remainingCents, 0);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2"><Badge variant="secondary">Staff only</Badge><Badge variant="outline">Read only</Badge></div>
          <h1 className="font-heading text-3xl font-semibold">ROAS billing update</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            One place for the corrected quote terms, recorded invoices, annual K-1 sets and conditional filing-fee review. Nothing here files, issues, charges or moves money.
          </p>
        </div>
        <Button variant="outline" onClick={copyUpdateLink}>Copy update link</Button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Current quote</CardDescription><CardTitle className="text-2xl">{data.quote.number}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><Badge variant="outline">{label(data.quote.status)}</Badge></div>
            <p className="text-muted-foreground">{data.quote.title}</p>
            <Button asChild size="sm" variant="outline"><Link to="/sales/quotes/$id" params={{ id: data.quote.id }}>Open draft quote</Link></Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Recorded invoices</CardDescription><CardTitle className="text-2xl">{data.invoices.length}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{openInvoices.length} awaiting payment · {money(outstandingCents)} outstanding</p>
            <Button asChild size="sm" variant="outline"><Link to="/ops/billing/invoices">Open invoice board</Link></Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Conditional filing review</CardDescription><CardTitle className="text-2xl">{money(filing.lowCents)} to {money(filing.highCents)}</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Includes the {money(ROAS_FILING_FEES.harmoniousPreparationCents)} Harmonious preparation fee and Texas at its {money(ROAS_FILING_FEES.texasCapCents)} cap. Final amounts still need confirmed sale facts.</CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Draft quote terms</CardTitle>
          <CardDescription>{data.clientName} · {data.fundName} · quote total {money(data.quote.totalCents)}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Service</TableHead><TableHead>Cadence</TableHead><TableHead>First bill</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.label}</TableCell>
                  <TableCell className="capitalize">{label(line.billingFrequency)}</TableCell>
                  <TableCell>{line.firstBillOn ?? "Not set"}</TableCell>
                  <TableCell className="text-right">{money(line.lineCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoices and recorded payments</CardTitle>
          <CardDescription>Original amounts stay unchanged. Recorded receipts show separately from any remaining balance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.invoices.map((invoice) => (
            <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{invoice.number ?? "Draft invoice"}</span>
                  <Badge variant={invoice.status === "paid" ? "secondary" : invoice.status === "void" ? "outline" : "default"}>{label(invoice.status)}</Badge>
                  {invoice.partiallyPaid ? <Badge variant="outline">Partially paid</Badge> : null}
                </div>
                <p className="text-muted-foreground">
                  Total {money(invoice.totalCents)} · paid {money(invoice.paidCents)} · remaining {money(invoice.remainingCents)}
                  {invoice.dueDate ? ` · due ${invoice.dueDate}` : ""}
                </p>
                {invoice.voidReason ? <p className="text-xs text-muted-foreground">Cancellation note: {invoice.voidReason}</p> : null}
              </div>
              <Button size="sm" variant="outline" onClick={() => void copyClientInvoiceLink(invoice.id)}>Copy client link</Button>
            </div>
          ))}
          {!data.invoices.length ? <p className="text-sm text-muted-foreground">No ROAS invoices are recorded yet.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filing-fee review</CardTitle>
          <CardDescription>Conditional preparation only. No notice has been filed or paid from this page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Recorded investor states are California, Florida, Maryland, New York, Texas and Virginia. Base state fees are {money(ROAS_FILING_FEES.stateBaseLowCents)} or {money(ROAS_FILING_FEES.stateBaseHighCents)}, depending on New York's offering-size tier. Texas is 0.1% of the confirmed offering amount, capped at {money(ROAS_FILING_FEES.texasCapCents)}.
          </p>
          <p className="text-muted-foreground">
            Before payable fees are prepared, confirm each state's first-sale date, the aggregate offering amount, each investing party's jurisdiction and whether any notices were filed outside Harmonious.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What happens next</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Approve the draft quote through the normal second-person review.</li>
            <li>Create the linked SOW after approval, then send it for client signature.</li>
            <li>Prepare replacement invoices only after payment dates and source attribution are confirmed.</li>
            <li>Confirm the filing facts above before any Form D, state notice or payment preparation.</li>
          </ol>
        </CardContent>
      </Card>
    </main>
  );
}
