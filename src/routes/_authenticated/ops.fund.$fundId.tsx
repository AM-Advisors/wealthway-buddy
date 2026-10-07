import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { OpsFundPage } from "@/components/ops-fund-page";

export const Route = createFileRoute("/_authenticated/ops/fund/$fundId")({
  validateSearch: (search: Record<string, unknown>): { tab?: string | undefined } => ({
    tab: typeof search["tab"] === "string" ? (search["tab"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Fund - Harmonious operations" },
      { name: "description", content: "One page per fund: setup and launch readiness, investors, banking, documents and more." },
      { property: "og:title", content: "Fund - Harmonious operations" },
      { property: "og:description", content: "One page per fund: setup and launch readiness, investors, banking, documents and more." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FundRoute,
});

function FundRoute() {
  const { fundId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return <OpsFundPage fundId={fundId} tab={tab ?? "setup"} onTab={(v) => navigate({ search: { tab: v }, replace: true })} />;
}
