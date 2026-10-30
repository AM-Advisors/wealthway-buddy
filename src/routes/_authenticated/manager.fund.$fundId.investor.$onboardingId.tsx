import { createFileRoute } from "@tanstack/react-router";
import { INVESTOR_RECORD_TABS, InvestorRecordPage, type InvestorRecordTab } from "@/components/investor-record-page";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/investor/$onboardingId")({
  head: () => ({ meta: [
    { title: "Fund Investor | Harmonious Manager" }, { name: "description", content: "Manage your fund investor's details, documents and outstanding onboarding actions." },
    { property: "og:title", content: "Fund Investor | Harmonious Manager" }, { property: "og:description", content: "Investor onboarding actions and document review for the authorized fund manager." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  validateSearch: (s: Record<string, unknown>): { tab?: InvestorRecordTab } => (INVESTOR_RECORD_TABS as readonly string[]).includes(String(s["tab"])) ? { tab: s["tab"] as InvestorRecordTab } : {},
  component: ManagerInvestorRecord,
});

function ManagerInvestorRecord() {
  const { fundId, onboardingId } = Route.useParams();
  const { tab } = Route.useSearch();
  return <InvestorRecordPage fundId={fundId} onboardingId={onboardingId} initial={tab} />;
}
