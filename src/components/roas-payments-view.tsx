import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { paymentTotals, trackedK1Sets, type TrackedInvoice, type TrackedLine } from "@/lib/roas-payment-tracking";

const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const date = (value: string | null) => value?.slice(0, 10) ?? "Not recorded";

export function RoasPaymentsView({ invoices, lines, year, onYearChange, invoiceAction }: {
  invoices: TrackedInvoice[]; lines: TrackedLine[]; year: number; onYearChange: (year: number) => void;
  invoiceAction?: (id: string) => React.ReactNode;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const totals = paymentTotals(invoices);
  const { sets, expected } = trackedK1Sets(invoices, lines, year);
  const visible = invoices.filter(invoice => showHistory || invoice.status !== "void");
  const voided = visible.filter(invoice => invoice.status === "void");
  const settled = (invoice: TrackedInvoice) => invoice.status === "paid" || invoice.remainingCents === 0;
  const unpaid = visible.filter(invoice => invoice.status !== "void" && !settled(invoice));
  const paid = visible.filter(invoice => invoice.status !== "void" && settled(invoice));
  const invoiceRows = (list: TrackedInvoice[]) => list.map(invoice => <TableRow key={invoice.id}>
    <TableCell><span className="font-medium">{invoice.number ?? "Draft invoice"}</span><p className="text-xs text-muted-foreground">Due {date(invoice.dueDate)}</p></TableCell>
    <TableCell><Badge variant={invoice.status === "paid" ? "secondary" : "outline"}>{invoice.status === "issued" && invoice.paidCents > 0 && invoice.remainingCents > 0 ? "Partially paid" : invoice.status.replace(/_/g, " ")}</Badge></TableCell>
    <TableCell className="text-right tabular-nums">{money(invoice.totalCents)}</TableCell><TableCell className="text-right tabular-nums">{money(invoice.paidCents)}</TableCell><TableCell className="text-right tabular-nums">{money(invoice.remainingCents)}</TableCell><TableCell>{invoiceAction?.(invoice.id)}</TableCell>
  </TableRow>);
  return <div className="space-y-8">
    <dl className="grid gap-5 border-y py-5 sm:grid-cols-3">
      {[["Current invoiced", totals.billedCents], ["Recorded received", totals.receivedCents], ["Outstanding", totals.balanceCents]].map(([name, value]) => <div key={name}><dt className="text-sm text-muted-foreground">{name}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{money(Number(value))}</dd></div>)}
    </dl>
    <section className="space-y-4" aria-label="Invoices">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Invoices</h2><Button variant="outline" size="sm" aria-pressed={showHistory} onClick={() => setShowHistory(value => !value)}>{showHistory ? "Hide voided" : "Show voided history"}</Button></div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Unpaid invoices ({unpaid.length})</h3>
        <Table><TableHeader><TableRow><TableHead>Invoice / due</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Invoiced</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Balance</TableHead><TableHead><span className="sr-only">Invoice actions</span></TableHead></TableRow></TableHeader>
          <TableBody>{invoiceRows(unpaid)}</TableBody></Table>
        {!unpaid.length && <p className="text-sm text-muted-foreground">No unpaid invoices recorded.</p>}
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Paid invoices ({paid.length})</h3>
        <Table><TableHeader><TableRow><TableHead>Invoice / due</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Invoiced</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Balance</TableHead><TableHead><span className="sr-only">Invoice actions</span></TableHead></TableRow></TableHeader>
          <TableBody>{invoiceRows(paid)}</TableBody></Table>
        {!paid.length && <p className="text-sm text-muted-foreground">No paid invoices recorded.</p>}
      </div>
      {showHistory && <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Voided history ({voided.length})</h3>
        <Table><TableHeader><TableRow><TableHead>Invoice / due</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Invoiced</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Balance</TableHead><TableHead><span className="sr-only">Invoice actions</span></TableHead></TableRow></TableHeader>
          <TableBody>{invoiceRows(voided)}</TableBody></Table>
        {!voided.length && <p className="text-sm text-muted-foreground">No voided invoices.</p>}
      </div>}
    </section>
    <section className="space-y-3" aria-label="Payments received"><h2 className="text-xl font-semibold">Payments received</h2>
      <Table><TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Recorded payment date</TableHead><TableHead className="text-right">Received to date</TableHead><TableHead>Evidence</TableHead></TableRow></TableHeader><TableBody>{received.map(invoice => <TableRow key={invoice.id}><TableCell>{invoice.number ?? "Invoice"}</TableCell><TableCell>{date(invoice.paidOn)}</TableCell><TableCell className="text-right tabular-nums">{money(invoice.paidCents)}</TableCell><TableCell>{invoice.status === "paid" ? "Invoice settled" : "Recorded receipt total"}</TableCell></TableRow>)}</TableBody></Table>
      <p className="text-xs text-muted-foreground">Cumulative received totals, not individual bank transactions. Voided invoice receipts are retained in history and excluded from current totals.</p>
      {!received.length && <p className="text-sm text-muted-foreground">No payments recorded against current invoices.</p>}
    </section>
    <section className="space-y-4" aria-label="K-1 set payments">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">K-1 set payments</h2><label className="flex items-center gap-2 text-sm">Tax year<Input aria-label="Tax year" type="number" min={2026} max={9999} value={year} onChange={event => { const next = Number(event.target.value); if (Number.isInteger(next) && next >= 2026 && next <= 9999) onYearChange(next); }} className="w-24" /></label></div>
      <div className="grid gap-4 sm:grid-cols-2">{expected.map(item => <div key={item.entity} className="rounded-md border p-4"><h3 className="font-semibold">{item.entity}</h3><p className="mt-2 text-sm">{money(item.amountCents)} · Due {item.dueOn}</p><p className="mt-1 text-xs text-muted-foreground">Confirmed annual terms · invoice evidence below</p></div>)}</div>
      <Table><TableHeader><TableRow><TableHead>Recorded set / invoice</TableHead><TableHead>Tax year</TableHead><TableHead className="text-right">Set charge</TableHead><TableHead>Payment status</TableHead><TableHead>Paid on</TableHead></TableRow></TableHeader><TableBody>{sets.map(set => <TableRow key={set.id}><TableCell><span className="font-medium">{set.label}</span><p className="text-xs text-muted-foreground">{set.invoice.number ?? "Draft invoice"}</p></TableCell><TableCell>{set.taxYear ?? "Period not recorded"}</TableCell><TableCell className="text-right tabular-nums">{money(set.amountCents)}</TableCell><TableCell><Badge variant={set.status === "Paid" ? "secondary" : "outline"}>{set.status}</Badge></TableCell><TableCell>{date(set.paidOn)}</TableCell></TableRow>)}</TableBody></Table>
      {!sets.length && <p className="text-sm text-muted-foreground">No K-1 invoice sets recorded for this tax year. The annual terms above are not proof of payment.</p>}
      {sets.some(set => set.status === "Allocation needed") && <p role="status" className="text-sm text-muted-foreground">Part of the invoice is paid, but no set-level allocation is recorded. Neither K-1 set is marked paid until the invoice is fully settled.</p>}
    </section>
  </div>;
}