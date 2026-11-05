import { ManagerLaunchCard } from "@/components/manager-launch-card";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { FundCommandCenter, type CommandTarget } from "@/components/fund-command-center";
import { ManagerFundDashboard } from "@/components/manager-fund-dashboard";
import { FundUpdatesFeed } from "@/components/fund-updates-feed";
import { ManagerCloseSheets } from "@/components/accounting-phase5";

/** Old in-page areas now live in the fund's top tabs; keep emailed links working. */
const AREA_TO_TAB = {
  setup: "settings", investors: "investors", documents: "documents", link: "onboarding-link", team: "team",
} as const;

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/")({
  validateSearch: (search: Record<string, unknown>): { area?: string | undefined } => ({
    area: typeof search["area"] === "string" ? search["area"] : undefined,
  }),
  beforeLoad: ({ search, params }) => {
    const tab = search.area ? AREA_TO_TAB[search.area as keyof typeof AREA_TO_TAB] : undefined;
    if (tab) throw redirect({ to: `/manager/fund/$fundId/${tab}` as never, params: { fundId: params.fundId } as never });
  },
  head: () => ({ meta: [
    { title: "Fund overview | Harmonious" },
    { name: "description", content: "Next step, launch status, investor progress and recent activity for your fund." },
    { property: "og:title", content: "Fund overview | Harmonious" },
    { property: "og:description", content: "One overview per fund: next step, launch status and recent activity." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Overview,
});

function Overview() {
  const { fundId } = Route.useParams();
  const navigate = useNavigate();
  const go = (t: CommandTarget) => {
    if (t === "banking" || t === "accounting") return navigate({ to: "/manager/fund-banking/$fundId", params: { fundId } });
    return navigate({ to: ({ setup: "/manager/fund/$fundId/settings", documents: "/manager/fund/$fundId/documents", calendar: "/manager/fund/$fundId/calendar", investors: "/manager/fund/$fundId/investors", capital: "/manager/fund/$fundId/transactions", approvals: "/manager/fund/$fundId/approvals", requests: "/manager/fund/$fundId/requests" } as const)[t], params: { fundId } });
  };
  return <div className="space-y-6">
    <FundCommandCenter fundId={fundId} onNavigate={go} />
    <ManagerLaunchCard fundId={fundId} onNavigate={go} />
    <ManagerFundDashboard fundId={fundId} />
    <FundUpdatesFeed offeringId={fundId} limit={6} />
    <ManagerCloseSheets offeringId={fundId} />
  </div>;
}
