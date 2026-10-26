import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { invoicePeriodTotals, type ReportInvoice } from "@/lib/invoice-period-totals";
import type { ReportingCadence } from "@/lib/payment-planning";

export function InvoicePeriodSummary({ invoices }: { invoices: (ReportInvoice & { number?: string | null })[] }) {
  const [cadence, setCadence] = useState<ReportingCadence>("quarterly");
  const [selection, setSelection] = useState<string[] | null>(null);
  const eligible = invoices.filter(i => i.status === "issued" || i.status === "paid");
  const ids = selection ?? eligible.map(i => i.id);
  const totals = invoicePeriodTotals(eligible, ids, cadence);
  const money = (cents: number, currency: string) => (cents / 100).toLocaleString("en-US", { style: "currency", currency });
  return <section className="space-y-4 border-y py-5" aria-label="Invoice balances by period">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-semibold">Invoice balances by period</h2>
      <ToggleGroup type="single" variant="outline" value={cadence} onValueChange={v => { if (v) setCadence(v as ReportingCadence); }} aria-label="Invoice reporting period">
        <ToggleGroupItem value="monthly">Monthly</ToggleGroupItem><ToggleGroupItem value="quarterly">Quarterly</ToggleGroupItem><ToggleGroupItem value="annual">Annual</ToggleGroupItem>
      </ToggleGroup>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" variant="outline" onClick={() => setSelection(ids.length ? [] : null)}>{ids.length ? "Clear selection" : "Select all"}</Button>
      {eligible.map(inv => <label key={inv.id} className="flex items-center gap-2 text-sm"><Checkbox checked={ids.includes(inv.id)} onCheckedChange={v => setSelection(v ? [...new Set([...ids, inv.id])] : ids.filter(id => id !== inv.id))} />{inv.number ?? "Invoice"}</label>)}
    </div>
    <div aria-live="polite" className="space-y-4">
      {totals.map(t => <div key={`${t.period}:${t.currency}`} className="border-t pt-3">
        <h3 className="text-sm font-medium">{t.period} · {t.currency}</h3>
        <dl className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {([["Billed", t.billedCents], ["Paid", t.paidCents], ["Remaining", t.remainingCents]] as const).map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{money(value, t.currency)}</dd></div>)}
        </dl>
      </div>)}
      {!totals.length && <p className="text-sm text-muted-foreground">No invoices selected.</p>}
    </div>
  </section>;
}