import { createFileRoute } from "@tanstack/react-router";
import { FundWorkspaceSection } from "@/components/fund-workspace-section";
import { FundManagerSetupLoader } from "@/components/fund-manager-setup-loader";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/settings")({
  head: () => ({ meta: [
    { title: "Fund settings - Harmonious" }, { name: "description", content: "Manage fund details, public access, permissions, dates, alerts, and assigned team." },
    { property: "og:title", content: "Fund settings - Harmonious" }, { property: "og:description", content: "Manage fund details, access, permissions, dates, and assigned team." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: Page,
});
function Page() { const { fundId } = Route.useParams(); return <div className="space-y-6"><FundManagerSetupLoader offeringId={fundId} /><FundWorkspaceSection title="Settings" description="Fund configuration, access, team authority, and investor-facing publishing." items={[
  { title: "Fund details", description: "Legal entity, offering type, targets, fees, and share price.", to: "/admin/setup" },
  { title: "Roles & permissions", description: "Assigned team, document access, and investor visibility.", to: "/manager/permissions" },
  { title: "Fund access", description: "Invite investors and manage access to this offering.", to: "/admin/access" },
  { title: "Public fund page", description: "Control what prospective investors can see.", to: "/manager/public-page" },
  { title: "Key dates", description: "Closing, wire, launch, and reporting dates.", to: "/manager/timeline" },
  { title: "Manager profile & alerts", description: "Your contact details and notification preferences.", to: "/manager/profile" },
]}/></div>; }