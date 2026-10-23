import { createFileRoute } from "@tanstack/react-router";
import { FundDocumentsHub } from "@/components/fund-documents-hub";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/documents")({
  head: () => ({ meta: [
    { title: "Fund documents | Harmonious" }, { name: "description", content: "Send offering documents to investors and manage signed copies, diligence files, permissions, and tax records." },
    { property: "og:title", content: "Fund documents | Harmonious" }, { property: "og:description", content: "Send and manage offering, diligence, signed, and tax documents for one fund." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: Page,
});
function Page() {
  const { fundId } = Route.useParams();
  return <FundDocumentsHub fundId={fundId} staff={false} />;
}
