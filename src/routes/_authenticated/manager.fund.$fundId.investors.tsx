import { createFileRoute } from "@tanstack/react-router";
import { ManagerFundInvestors } from "@/components/manager-fund-investors";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/investors")({
  head: () => ({ meta: [
    { title: "Fund investors — Harmonious" }, { name: "description", content: "Review investor identity, accreditation, documents, commitments, and funding for one fund." },
    { property: "og:title", content: "Fund investors — Harmonious" }, { property: "og:description", content: "Review every investor status and commitment for one fund." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: Page,
});
function Page() { return <ManagerFundInvestors fundId={Route.useParams().fundId} />; }