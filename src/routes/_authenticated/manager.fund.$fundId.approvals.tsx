import { createFileRoute } from "@tanstack/react-router";
import { FundApprovals } from "@/components/fund-approvals";
import { ManagerFundReviews } from "@/components/manager-fund-reviews";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/approvals")({
  head: () => ({ meta: [
    { title: "Approvals - Harmonious" },
    { name: "description", content: "Review investor verification, banking evidence, document approvals and reconciled receipts for your Harmonious fund." },
    { property: "og:title", content: "Approvals - Harmonious" },
    { property: "og:description", content: "Review investor verification, banking evidence, document approvals and reconciled receipts for your Harmonious fund." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

function Page() {
  const { fundId } = Route.useParams();
  return <div className="space-y-6"><h2 className="text-xl">Approvals</h2><ManagerFundReviews fundId={fundId} /><FundApprovals fundId={fundId} /></div>;
}
