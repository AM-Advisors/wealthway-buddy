import { FundApprovalsHub } from "@/components/fund-approvals-hub";
import { createFileRoute } from "@tanstack/react-router";

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
  return <FundApprovalsHub fundId={fundId} staff={false} initial="approvals" />;
}
