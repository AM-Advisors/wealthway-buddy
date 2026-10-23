import { createFileRoute, useParams } from "@tanstack/react-router";

import { FundCapTable } from "@/components/fund-cap-table";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/cap-table")({
  head: () => ({
    meta: [
      { title: "Fund cap table - Harmonious" },
      { name: "description", content: "Ownership by investor and class, with effective terms including side letters." },
      { property: "og:title", content: "Fund cap table - Harmonious" },
      { property: "og:description", content: "Investor ownership and effective terms for this Fund." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const { fundId } = useParams({ from: "/_authenticated/manager/fund/$fundId/cap-table" });
  return <FundCapTable fundId={fundId} sideLettersHref={`/manager/fund/${fundId}/side-letters`} />;
}
