import { FundApprovalsHub } from "@/components/fund-approvals-hub";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/requests")({
  head: () => ({ meta: [
    { title: "Requests | Harmonious" },
    { name: "description", content: "Ask Harmonious for capital calls, distributions, reports, filings and more, and track each request." },
    { property: "og:title", content: "Requests | Harmonious" },
    { property: "og:description", content: "Ask Harmonious for capital calls, distributions, reports, filings and more, and track each request." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

function Page() {
  const { fundId } = Route.useParams();
  return <FundApprovalsHub fundId={fundId} staff={false} initial="requests" />;
}
