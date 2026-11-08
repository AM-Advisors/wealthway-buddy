import { createFileRoute } from "@tanstack/react-router";

import { FundBanking } from "@/components/fund-banking";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/banking")({
  head: () => ({ meta: [
    { title: "Fund banking | Harmonious" },
    { name: "description", content: "Your fund's receiving account, bank application, deposits and investor wires, inside the fund." },
    { property: "og:title", content: "Fund banking | Harmonious" },
    { property: "og:description", content: "Bank details, deposits and wire tracking for your fund." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: Page,
});

function Page() {
  const { fundId } = Route.useParams();
  return <FundBanking fundId={fundId} backTo="manager" embedded />;
}
