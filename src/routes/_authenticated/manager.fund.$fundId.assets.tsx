import { createFileRoute } from "@tanstack/react-router";
import { FundWorkspaceSection } from "@/components/fund-workspace-section";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/assets")({
  head: () => ({ meta: [
    { title: "Assets and performance — Harmonious" }, { name: "description", content: "Portfolio value, fund performance, ownership, and capital reporting." },
    { property: "og:title", content: "Assets and performance — Harmonious" }, { property: "og:description", content: "Portfolio value, fund performance, ownership, and capital reporting." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: Page,
});
function Page() { return <FundWorkspaceSection title="Assets & performance" description="Valuation, ownership, returns, and investor capital records." items={[
  { title: "Portfolio value", description: "Current fund value, share price, and investor ownership.", to: "/manager/portfolio-value" },
  { title: "Fund performance", description: "Cash flow, distributions, gain, and return measures.", to: "/manager/performance" },
  { title: "Fund cap table", description: "Committed capital, shares, and ownership percentages.", to: "/manager/cap-table" },
  { title: "Capital accounts", description: "Closing records and investor capital account statements.", to: "/manager/closing" },
]}/>; }