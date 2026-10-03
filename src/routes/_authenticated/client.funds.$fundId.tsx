import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FundWorkspace, FUND_TABS, type FundTab } from "@/components/fund-workspace";

const TABS = FUND_TABS;
type Tab = FundTab;

export const Route = createFileRoute("/_authenticated/client/funds/$fundId")({
  head: () => ({
    meta: [
      { title: "Fund - Harmonious client portal" },
      { name: "description", content: "Fund details, investors, banking, accounting, assets and closes for your fund." },
      { property: "og:title", content: "Fund - Harmonious client portal" },
      { property: "og:description", content: "Fund details, investors, banking, taxes, assets and closes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { tab?: Tab | undefined } => ({
    tab: TABS.includes(s["tab"] as Tab) ? (s["tab"] as Tab) : undefined,
  }),
  component: ClientFundPage,
});

function ClientFundPage() {
  const { fundId } = Route.useParams();
  const { tab = "todos" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return <FundWorkspace fundId={fundId} tab={tab} onTab={(v) => navigate({ search: { tab: v as Tab }, replace: true })} />;
}
