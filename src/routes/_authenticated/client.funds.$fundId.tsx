import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { FundWorkspace, FUND_TABS, type FundTab } from "@/components/fund-workspace";
import { Button } from "@/components/ui/button";
import { Building2, Users, FileText } from "lucide-react";

const TABS = FUND_TABS;
type Tab = FundTab;

export const Route = createFileRoute("/_authenticated/client/funds/$fundId")({
  head: () => ({
    meta: [
      { title: "Fund | Harmonious client portal" },
      { name: "description", content: "Fund details, investors, banking, accounting, assets and closes for your fund." },
      { property: "og:title", content: "Fund | Harmonious client portal" },
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
  const { tab = "overview" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return <><nav aria-label="Fund manager actions" className="mx-auto flex max-w-7xl flex-wrap gap-2 px-4 pt-5"><Button asChild variant="outline"><Link to="/manager/fund/$fundId" params={{ fundId }} search={{ area: "setup" }}><Building2 className="mr-2 size-4" />Set up fund</Link></Button><Button asChild variant="outline"><Link to="/manager/fund/$fundId" params={{ fundId }} search={{ area: "investors" }}><Users className="mr-2 size-4" />Investor invitations</Link></Button><Button asChild variant="outline"><Link to="/manager/fund/$fundId" params={{ fundId }} search={{ area: "documents" }}><FileText className="mr-2 size-4" />Manage documents</Link></Button></nav><FundWorkspace fundId={fundId} tab={tab} onTab={(v) => navigate({ search: { tab: v as Tab }, replace: true })} /></>;
}
