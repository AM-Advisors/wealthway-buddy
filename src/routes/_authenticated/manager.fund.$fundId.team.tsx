import { createFileRoute, useParams } from "@tanstack/react-router";

import { FundTeam } from "@/components/fund-team";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/team")({
  head: () => ({
    meta: [
      { title: "Fund team — Harmonious" },
      { name: "description", content: "Harmonious staff, fund managers and delegated professionals with access to this fund." },
      { property: "og:title", content: "Fund team — Harmonious" },
      { property: "og:description", content: "Who has operational access to this fund, and why." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { fundId } = useParams({ from: "/_authenticated/manager/fund/$fundId/team" });
  return <FundTeam fundId={fundId} />;
}
