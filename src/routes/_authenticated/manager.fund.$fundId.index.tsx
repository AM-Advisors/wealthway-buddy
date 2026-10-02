import { createFileRoute } from "@tanstack/react-router";

import { ManagerFundHome } from "@/components/manager-fund-home";
import { ManagerFundDashboard } from "@/components/manager-fund-dashboard";
import { FundUpdatesFeed } from "@/components/fund-updates-feed";
import { FormationRecordCard } from "@/components/formation-record-card";
import { ManagerCloseSheets } from "@/components/accounting-phase5";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/")({
  head: () => ({ meta: [
    { title: "Fund overview - Harmonious" },
    { name: "description", content: "Fund profile, readiness, capital, scope, providers, and recent investor activity." },
    { property: "og:title", content: "Fund overview - Harmonious" },
    { property: "og:description", content: "Fund profile, readiness, capital, scope, providers, and recent investor activity." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Overview,
});

function Overview() {
  const { fundId } = Route.useParams();
  return <div className="space-y-6"><ManagerFundDashboard fundId={fundId} /><FundUpdatesFeed offeringId={fundId} limit={6} /><FormationRecordCard offeringId={fundId} /><ManagerCloseSheets offeringId={fundId} /><ManagerFundHome offeringId={fundId} embedded /></div>;
}