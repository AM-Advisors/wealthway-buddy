import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { InvoiceDueDate } from "@/components/invoice-due-date";
import { getInvoiceOriginalQuote } from "@/lib/client-invoice-documents.functions";
import { billingDate } from "@/lib/client-billing-links";

const originalQuote = (invoiceId: string) => queryOptions({ queryKey: ["invoice-original-quote", invoiceId], queryFn: () => getInvoiceOriginalQuote({ data: { invoiceId } }) });
export const Route = createFileRoute("/_authenticated/client/invoices_/$invoiceId/quote")({
  head: () => ({ meta: [
    { title: "Original quote and proposal | Harmonious" },
    { name: "description", content: "Read the original commercial document connected to your Harmonious invoice and its payment deadline." },
    { property: "og:title", content: "Original quote and proposal | Harmonious" },
    { property: "og:description", content: "Review your recorded quote, related invoice and agreement." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(originalQuote(params.invoiceId)),
  errorComponent: ({ error }) => <div className="space-y-3 p-4"><p role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : "The original quote could not be loaded."}</p><Button asChild variant="outline"><Link to="/client/invoices">Back to invoices</Link></Button></div>,
  notFoundComponent: () => <p>Original quote not found.</p>,
  component: InvoiceQuotePage,
});
function InvoiceQuotePage() {
  const { invoiceId } = Route.useParams();
  const { data } = useSuspenseQuery(originalQuote(invoiceId));
  const money = (n: number) => (n / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  return <main className="mx-auto max-w-3xl space-y-6 py-6">
    <Button asChild size="sm" variant="outline"><Link to="/client/invoices" search={{ invoice: invoiceId }}>Back to invoice {data.invoice?.number}</Link></Button>
    <header><p className="text-xs text-muted-foreground">Original commercial document · version {data.version}</p><h1 className="mt-1 text-2xl">{data.title}</h1><p className="mt-2 text-sm text-muted-foreground">Quote valid until: {billingDate(data.validUntil)}</p></header>
    {data.invoice && <InvoiceDueDate invoice={data.invoice} />}
    {data.sections.map((s, i) => <section key={i} className="border-t pt-4"><h2 className="text-base font-semibold">{s.title}</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm">{s.body}</p></section>)}
    <section className="border-y py-4"><h2 className="text-base font-semibold">Recorded billed services</h2><ul className="mt-3 space-y-2">{data.lines.map((l, i) => <li key={i} className="flex justify-between gap-4 text-sm"><span className="min-w-0 break-words">{l.label}{l.quantity > 1 ? ` × ${l.quantity}` : ""}</span><strong className="shrink-0">{money(Number(l.amount_cents))}</strong></li>)}</ul></section>
  </main>;
}