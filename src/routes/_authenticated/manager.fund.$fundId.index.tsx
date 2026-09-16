import { createFileRoute } from "@tanstack/react-router";

import { ManagerFundHome } from "@/components/manager-fund-home";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/")({
  head: () => ({ meta: [
    { title: "Fund overview — Harmonious" },
    { name: "description", content: "Fund profile, readiness, capital, scope, providers, and recent investor activity." },
    { property: "og:title", content: "Fund overview — Harmonious" },
    { property: "og:description", content: "Fund profile, readiness, capital, scope, providers, and recent investor activity." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Overview,
});

function Overview() { return <ManagerFundHome offeringId={Route.useParams().fundId} embedded />; }