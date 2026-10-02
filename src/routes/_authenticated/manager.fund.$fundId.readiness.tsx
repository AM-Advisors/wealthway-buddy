import { createFileRoute, useParams } from "@tanstack/react-router";

import { FundReadiness } from "@/components/investment-readiness";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/readiness")({
  head: () => ({
    meta: [
      { title: "Investor readiness - Harmonious" },
      { name: "description", content: "Progress, next action and close readiness for every investment in this fund." },
      { property: "og:title", content: "Investor readiness - Harmonious" },
      { property: "og:description", content: "One canonical checklist per investment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { fundId } = useParams({ from: "/_authenticated/manager/fund/$fundId/readiness" });
  return <FundReadiness fundId={fundId} />;
}
