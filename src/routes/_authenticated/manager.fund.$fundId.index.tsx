import { ManagerLaunchCard } from "@/components/manager-launch-card";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FundSetupForm } from "@/components/fund-setup-form";
import { FundCommandCenter, type CommandTarget } from "@/components/fund-command-center";

import { ManagerFundDashboard } from "@/components/manager-fund-dashboard";
import { FundUpdatesFeed } from "@/components/fund-updates-feed";
import { FormationRecordCard } from "@/components/formation-record-card";
import { ManagerCloseSheets } from "@/components/accounting-phase5";
import { SELF_SERVE_AREAS, SelfServeFundPage, type SelfServeArea } from "@/components/self-serve-fund-page";
import { ManagerFundInvestors } from "@/components/manager-fund-investors";
import { ManagerInvestorTodoList } from "@/components/manager-investor-todos";
import { FundDocumentsHub } from "@/components/fund-documents-hub";
import { FundOnboardingLinkCard } from "@/components/fund-onboarding-link";
import { FundTeamAccessBox } from "@/components/fund-team-access-box";
import { ManagerDraftReview } from "@/components/fund-team-drafts";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/")({
  validateSearch: (search: Record<string, unknown>): { area?: SelfServeArea | undefined } => ({ area: SELF_SERVE_AREAS.find(a => a === search["area"]) }),
  head: () => ({ meta: [
    { title: "Manage your fund | Harmonious" },
    { name: "description", content: "Set up your fund, invite investors, manage versioned documents and share your investor onboarding link." },
    { property: "og:title", content: "Manage your fund | Harmonious" },
    { property: "og:description", content: "Fund setup, investor invitations, document review and onboarding in your client workspace." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Overview,
});

function Overview() {
  const { fundId } = Route.useParams();
  const navigate = useNavigate();
  const { area = "setup" } = Route.useSearch();
  const go = (t: CommandTarget) => {
    if (t === "setup" || t === "documents") return navigate({ to: "/manager/fund/$fundId", params: { fundId }, search: { area: t } });
    if (t === "banking" || t === "accounting") return navigate({ to: "/manager/fund-banking/$fundId", params: { fundId } });
    return navigate({ to: ({ calendar: "/manager/fund/$fundId/calendar", investors: "/manager/fund/$fundId/investors", capital: "/manager/fund/$fundId/transactions", approvals: "/manager/fund/$fundId/approvals", requests: "/manager/fund/$fundId/requests" } as const)[t], params: { fundId } });
  };
  return <SelfServeFundPage area={area} onAreaChange={next => { void navigate({ to: "/manager/fund/$fundId", params: { fundId }, search: { area: next } }); }} sections={{
    setup: () => <div className="space-y-6"><FundCommandCenter fundId={fundId} nextActionOnly onNavigate={go} /><FundSetupForm offeringId={fundId} mode="manager" workspace /><ManagerLaunchCard fundId={fundId} /></div>,
    investors: () => <div className="space-y-6"><ManagerInvestorTodoList fundId={fundId} /><ManagerFundInvestors fundId={fundId} /></div>,
    documents: () => <FundDocumentsHub fundId={fundId} staff={false} />,
    link: () => <FundOnboardingLinkCard fundId={fundId} />,
    team: () => <div className="space-y-6"><FundTeamAccessBox fundId={fundId} /><ManagerDraftReview fundId={fundId} /></div>,
    overview: () => <div className="space-y-6"><FundCommandCenter fundId={fundId} onNavigate={go} /><ManagerFundDashboard fundId={fundId} /><FundUpdatesFeed offeringId={fundId} limit={6} /><FormationRecordCard offeringId={fundId} /><ManagerCloseSheets offeringId={fundId} /></div>,
  }} />;
}