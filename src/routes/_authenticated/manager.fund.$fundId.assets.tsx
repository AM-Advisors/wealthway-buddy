import { createFileRoute } from "@tanstack/react-router";
import { FundAssets } from "@/components/fund-assets";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/assets")({
  head: () => ({ meta: [
    { title: "Assets and performance - Harmonious" }, { name: "description", content: "Portfolio value, fund performance, ownership, and capital reporting." },
    { property: "og:title", content: "Assets and performance - Harmonious" }, { property: "og:description", content: "Portfolio value, fund performance, ownership, and capital reporting." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: Page,
});
function Page() { return <FundAssets fundId={Route.useParams().fundId} />; }
