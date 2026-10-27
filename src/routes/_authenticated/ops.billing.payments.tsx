import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RoasPaymentsView } from "@/components/roas-payments-view";
import { getRoasPayments } from "@/lib/ops-billing.functions";

const paymentsQuery = queryOptions({ queryKey: ["roas-payments"], queryFn: () => getRoasPayments() });
export const Route = createFileRoute("/_authenticated/ops/billing/payments")({
  validateSearch: (search: Record<string, unknown>) => ({ year: Number.isInteger(Number(search.year)) && Number(search.year) >= 2026 && Number(search.year) <= 9999 ? Number(search.year) : 2026 }),
  loader: ({ context }) => context.queryClient.ensureQueryData(paymentsQuery),
  errorComponent: ({ error }) => <PaymentsError error={error} />,
  notFoundComponent: () => <p className="p-6">Payment records not found.</p>,
  head: () => ({ meta: [
    { title: "ROAS payments | Harmonious Operations" },
    { name: "description", content: "Staff-only ROAS invoice balances, recorded receipts and annual K-1 set payment evidence." },
    { property: "og:title", content: "ROAS payments | Harmonious Operations" },
    { property: "og:description", content: "Recorded ROAS balances and K-1 payment status for authorized staff." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: PaymentsPage,
});

function PaymentsError({ error }: { error: Error }) {
  const router = useRouter();
  return <div className="space-y-3 p-6" role="alert"><p>{error.message}</p><Button variant="outline" onClick={() => void router.invalidate()}>Try again</Button></div>;
}
function PaymentsPage() {
  const { data, refetch, isFetching } = useSuspenseQuery(paymentsQuery);
  const { year } = Route.useSearch();
  const navigate = Route.useNavigate();
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
    <header className="flex flex-wrap items-start justify-between gap-3"><div className="space-y-2"><Badge variant="secondary">Staff only</Badge><h1 className="font-heading text-3xl font-semibold">ROAS payments</h1></div><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/ops/billing/roas-update">Billing overview</Link></Button><Button size="icon" variant="outline" aria-label="Refresh payments" title="Refresh payments" disabled={isFetching} onClick={() => void refetch()}><RefreshCw className="h-4 w-4" /></Button></div></header>
    <RoasPaymentsView {...data} year={year} onYearChange={next => void navigate({ search: { year: next }, replace: true })} invoiceAction={id => <Button asChild variant="ghost" size="sm"><Link to="/ops/billing/invoices" search={{ invoice: id }}>Open</Link></Button>} />
  </main>;
}