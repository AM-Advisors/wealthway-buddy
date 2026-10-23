import { createFileRoute } from "@tanstack/react-router";
import { FundCalendar } from "@/components/fund-calendar";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/calendar")({
  head: () => ({ meta: [
    { title: "Operating calendar - Harmonious" },
    { name: "description", content: "Accounting, NAV, reporting, tax, regulatory and entity dates for your fund." },
    { property: "og:title", content: "Operating calendar - Harmonious" },
    { property: "og:description", content: "Your fund's operating calendar and who each date is waiting on." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

function Page() {
  const { fundId } = Route.useParams();
  return <div className="space-y-4"><h2 className="text-xl">Operating calendar</h2><FundCalendar fundId={fundId} /></div>;
}
