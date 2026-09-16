import { createFileRoute, Link } from "@tanstack/react-router";
import { FundComplianceCard } from "@/components/fund-compliance-card";
import { FundCompliancePanel } from "@/components/fund-compliance-panel";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/compliance")({
  head: () => ({ meta: [
    { title: "Fund compliance — Harmonious" }, { name: "description", content: "Review fund obligations, investor KYC, AML, accreditation evidence, and exceptions." },
    { property: "og:title", content: "Fund compliance — Harmonious" }, { property: "og:description", content: "Review fund obligations and investor compliance evidence." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: Page,
});
function Page() { const { fundId } = Route.useParams(); return <section className="space-y-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl">Compliance</h2><p className="mt-1 text-sm text-muted-foreground">Fund obligations, investor verification, evidence, and review history.</p></div><Button asChild size="sm" variant="outline"><Link to="/manager/activity">Audit activity</Link></Button></div><FundCompliancePanel offeringId={fundId} /><FundComplianceCard offeringId={fundId} /></section>; }