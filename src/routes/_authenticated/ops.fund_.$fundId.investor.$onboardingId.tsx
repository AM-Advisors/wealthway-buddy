import { createFileRoute } from "@tanstack/react-router";
import { INVESTOR_RECORD_TABS, InvestorRecordPage, type InvestorRecordTab } from "@/components/investor-record-page";

export const Route = createFileRoute("/_authenticated/ops/fund_/$fundId/investor/$onboardingId")({
  head: () => ({ meta: [
    { title: "Investor Record | Harmonious" }, { name: "description", content: "Fund-scoped investor record: investment, profile, onboarding, readiness and activity." },
    { property: "og:title", content: "Investor Record | Harmonious" }, { property: "og:description", content: "Maintain a fund investor's canonical record." },
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
