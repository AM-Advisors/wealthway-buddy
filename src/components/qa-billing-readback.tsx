import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InvoicePeriodSummary } from "@/components/invoice-period-summary";
import { billingDate } from "@/lib/client-billing-links";
import { QA_INVOICE, QA_QUOTE, QA_SOW, fictionalBillingReadback } from "@/lib/qa-sandbox/billing-fixtures";
import { InvoiceFeePreview } from "@/components/invoice-fee-preview";
import { QA_FEE_ID } from "@/lib/qa-sandbox/fee-fixture";
import { RoasPaymentsView } from "@/components/roas-payments-view";

/** Fictional local readback only: no auth, server reads, signing or payments. */
export function QaBillingReadback() {
  const [view, setView] = useState<"invoice" | "quote" | "sow" | "payments">("invoice");
  const [taxYear, setTaxYear] = useState(2026);
  const { balance, quoteLinked, sowLinked } = fictionalBillingReadback();
  const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  return <section className="space-y-5" aria-label="Fictional client billing">
    <div className="flex flex-wrap gap-2" role="group" aria-label="Billing document"><Button variant={view === "invoice" ? "default" : "outline"} onClick={() => setView("invoice")}>Invoice</Button><Button disabled={!quoteLinked} variant={view === "quote" ? "default" : "outline"} onClick={() => setView("quote")}>Original quote</Button><Button disabled={!sowLinked} variant={view === "sow" ? "default" : "outline"} onClick={() => setView("sow")}>Agreement</Button></div>
    <Button variant={view === "payments" ? "default" : "outline"} onClick={() => setView("payments")}>Staff payment tracking</Button>
    {view === "payments" ? <RoasPaymentsView year={taxYear} onYearChange={setTaxYear} invoices={[
      { id: "fictional-k1-paid", number: "FABLE-K001", status: "paid", totalCents: 250000, paidCents: 250000, remainingCents: 0, paidOn: "2026-10-12", dueDate: "2026-12-31", periodStart: "2026-01-01", periodEnd: "2026-12-31" },
      { id: "fictional-k1-partial", number: "FABLE-K002", status: "issued", totalCents: 500000, paidCents: 100000, remainingCents: 400000, paidOn: "2026-10-20", dueDate: "2026-12-31", periodStart: "2026-01-01", periodEnd: "2026-12-31" },
      { id: "fictional-void", number: "FABLE-VOID", status: "void", totalCents: 1900000, paidCents: 0, remainingCents: 0, paidOn: null, dueDate: null, periodStart: null, periodEnd: null },
    ]} lines={[
      { id: "fictional-line-lp", invoiceId: "fictional-k1-paid", label: "Fablewood LP annual K-1 set", serviceKey: "tax_k1", amountCents: 250000 },
      { id: "fictional-line-mgmt", invoiceId: "fictional-k1-partial", label: "Fablewood management annual K-1 set", serviceKey: "tax_k1", amountCents: 250000 },
    ]} /> : view === "invoice" ? <>
      <div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold">{QA_INVOICE.number}</h2><Badge variant="outline">Partially paid</Badge></div>
      <p className="text-sm text-muted-foreground">Issued {billingDate(QA_INVOICE.issue_date)} · Due {billingDate(QA_INVOICE.due_date)}</p>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">{[["Total", QA_INVOICE.total_cents], ["Paid", balance.paidCents], ["Remaining", balance.remainingCents]].map(([label, cents]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{money(Number(cents))}</dd></div>)}</dl>
      <InvoicePeriodSummary invoices={[QA_INVOICE]} />
      <InvoiceFeePreview lineId={QA_FEE_ID} label="Quarterly administration" issueDate={QA_INVOICE.issue_date} />
    </> : view === "quote" ? <><h2 className="text-lg font-semibold">{QA_QUOTE.title}</h2><p className="text-sm">{QA_QUOTE.number} · Version {QA_QUOTE.version} · Signed</p><p className="font-medium">{money(QA_QUOTE.amountCents)} per quarter</p><Button variant="outline" onClick={() => setView("invoice")}>View linked invoice</Button></> : <><h2 className="text-lg font-semibold">{QA_SOW.title}</h2><Badge variant="outline">Active, fictional</Badge><p className="text-sm">{QA_SOW.scope}</p><p className="font-medium">{money(QA_SOW.amountCents)} per quarter</p><Button variant="outline" onClick={() => setView("invoice")}>View linked invoice</Button></>}
  </section>;
}