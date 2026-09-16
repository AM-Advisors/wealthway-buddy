import { createFileRoute } from "@tanstack/react-router";

import { FundWorkspaceLayout } from "@/components/fund-workspace-layout";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId")({
  head: () => ({
    meta: [
      { title: "Fund home — Harmonious fund manager" },
      {
        name: "description",
        content:
          "Setup progress, fund documents and every investor application for one Harmonious fund.",
      },
      { property: "og:title", content: "Fund home — Harmonious fund manager" },
      {
        property: "og:description",
        content: "One page per fund: setup progress, documents and investor applications.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FundWorkspaceRoute,
});

function FundWorkspaceRoute() {
  const { fundId } = Route.useParams();
  return <FundWorkspaceLayout fundId={fundId} />;
}
