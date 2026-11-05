import { createFileRoute } from "@tanstack/react-router";
import { FundWorkspaceSection } from "@/components/fund-workspace-section";
import { FundSetupForm } from "@/components/fund-setup-form";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { FormationRecordCard } from "@/components/formation-record-card";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/settings")({
  head: () => ({ meta: [
    { title: "Fund settings | Harmonious" }, { name: "description", content: "Manage fund details, public access, permissions, dates, alerts, and assigned team." },
    { property: "og:title", content: "Fund settings | Harmonious" }, { property: "og:description", content: "Manage fund details, access, permissions, dates, and assigned team." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: Page,
});
function Page() { const { fundId } = Route.useParams(); return <div className="space-y-6"><FundSetupForm offeringId={fundId} mode="manager" workspace /><FormationRecordCard offeringId={fundId} /><FundWorkspaceSection title="Settings" description="Fund configuration, access, team authority, and investor-facing publishing." items={[
  { title: "Roles & permissions", description: "Assigned team, document access, and investor visibility.", to: "/manager/permissions" },
  { title: "Public fund page", description: "Control what prospective investors can see.", to: "/manager/public-page" },
  { title: "Key dates", description: "Closing, wire, launch, and reporting dates.", to: "/manager/timeline" },
  { title: "Manager profile & alerts", description: "Your contact details and notification preferences.", to: "/manager/profile" },
]}/></div>; }