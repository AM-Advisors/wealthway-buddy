import { createFileRoute, Link } from "@tanstack/react-router";
import { FundOperations } from "@/components/fund-operations";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/transactions")({
  head: () => ({ meta: [
    { title: "Fund transactions — Harmonious" }, { name: "description", content: "Track incoming wires, payments, closings, bank activity, and transaction exceptions." },
    { property: "og:title", content: "Fund transactions — Harmonious" }, { property: "og:description", content: "Track incoming wires, payments, closings, and transaction exceptions." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: Page,
});
function Page() { const { fundId } = Route.useParams(); return <section><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl">Transactions</h2><p className="mt-1 text-sm text-muted-foreground">Incoming capital, bank matching, closing activity, and exceptions.</p></div><div className="flex gap-2"><Button asChild size="sm" variant="outline"><Link to="/manager/fund-banking/$fundId" params={{ fundId }}>Banking</Link></Button><Button asChild size="sm" variant="outline"><Link to="/manager/wires">Wire approvals</Link></Button><Button asChild size="sm"><Link to="/manager/closing">Closing desk</Link></Button></div></div><FundOperations offeringId={fundId} /></section>; }