import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RepOverview } from "@/components/sales/rep-overview";
import { getRepOverview } from "@/lib/sales-hub.functions";
import { usePeriod } from "@/components/sales/sales-ui";

export const Route = createFileRoute("/_authenticated/sales_/reps/$id")({
  head: () => ({
    meta: [
      { title: "Sales rep overview - Harmonious" },
      { name: "description", content: "One sales rep's outreach, pipeline, revenue and assigned client teams." },
      { property: "og:title", content: "Sales rep overview - Harmonious" },
      { property: "og:description", content: "Status, revenue closed and pending, and client team assignments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RepPage,
});

function RepPage() {
  const { id } = Route.useParams();
  const [period, setPeriod] = usePeriod("month");
  const load = useServerFn(getRepOverview);
  const q = useQuery({ queryKey: ["sales-rep", id, period], queryFn: () => load({ data: { ...period, repId: id } }), enabled: period.period !== "custom" || Boolean(period.from && period.to) });
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-10">
      <Link to="/sales/team" className="text-sm text-muted-foreground hover:underline">← Sales team</Link>
      <RepOverview data={q.data} error={q.error as Error | null} period={period} setPeriod={setPeriod} />
    </main>
  );
}
