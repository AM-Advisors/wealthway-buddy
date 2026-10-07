import { createFileRoute } from "@tanstack/react-router";
import { FundApprovals } from "@/components/fund-approvals";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/approvals")({
  head: () => ({ meta: [
    { title: "Approvals - Harmonious" },
    { name: "description", content: "Everything Harmonious needs you to approve, with amounts, preparers and history." },
    { property: "og:title", content: "Approvals - Harmonious" },
    { property: "og:description", content: "Everything Harmonious needs you to approve, with amounts, preparers and history." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

function Page() {
  const { fundId } = Route.useParams();
  return <div className="space-y-4"><h2 className="text-xl">Approvals</h2><FundApprovals fundId={fundId} /></div>;
}
