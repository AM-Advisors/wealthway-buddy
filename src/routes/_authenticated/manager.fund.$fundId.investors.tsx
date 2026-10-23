import { createFileRoute } from "@tanstack/react-router";
import { InvestorStepHistory } from "@/components/investor-step-history";
import { ManagerFundInvestors } from "@/components/manager-fund-investors";
import { FundReadiness } from "@/components/investment-readiness";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/investors")({
  head: () => ({ meta: [
    { title: "Fund investors | Harmonious" }, { name: "description", content: "Review investor identity, accreditation, documents, commitments, and funding for one fund." },
    { property: "og:title", content: "Fund investors | Harmonious" }, { property: "og:description", content: "Review every investor status and commitment for one fund." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: (s: Record<string, unknown>): { stage?: string | undefined; bucket?: string | undefined; add?: string | undefined } => ({
    stage: typeof s["stage"] === "string" ? s["stage"] : undefined, bucket: typeof s["bucket"] === "string" ? s["bucket"] : undefined, add: typeof s["add"] === "string" ? s["add"] : undefined,
  }),
  component: Page,
});
function Page() {
  const { fundId } = Route.useParams();
  return <ManagerFundInvestors fundId={fundId} extraTabs={[
    { value: "readiness", label: "Readiness", content: <FundReadiness fundId={fundId} /> },
    { value: "history", label: "History", content: <InvestorStepHistory offeringId={fundId} /> },
  ]} />;
}
