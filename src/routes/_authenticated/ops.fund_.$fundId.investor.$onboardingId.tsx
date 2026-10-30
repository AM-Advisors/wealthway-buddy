import { createFileRoute } from "@tanstack/react-router";
import { INVESTOR_RECORD_TABS, InvestorRecordPage, type InvestorRecordTab } from "@/components/investor-record-page";

export const Route = createFileRoute("/_authenticated/ops/fund_/$fundId/investor/$onboardingId")({
  head: () => ({ meta: [
    { title: "Investor Review | Harmonious Operations" }, { name: "description", content: "Review an investor's fund-specific checklist, uploaded documents and recorded activity in Harmonious Operations." },
    { property: "og:title", content: "Investor Review | Harmonious Operations" }, { property: "og:description", content: "Fund-specific investor review and outstanding actions for Harmonious staff." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  validateSearch: (s: Record<string, unknown>): { tab?: InvestorRecordTab } => (INVESTOR_RECORD_TABS as readonly string[]).includes(String(s["tab"])) ? { tab: s["tab"] as InvestorRecordTab } : {},
  component: OpsInvestorRecord,
});

function OpsInvestorRecord() {
  const { fundId, onboardingId } = Route.useParams();
  const { tab } = Route.useSearch();
  return <InvestorRecordPage fundId={fundId} onboardingId={onboardingId} initial={tab} />;
}
