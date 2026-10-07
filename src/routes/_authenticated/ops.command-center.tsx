import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { OpsCommandCenter, OPS_VIEWS, type OpsView } from "@/components/ops-command-center";

const views = OPS_VIEWS.map((v) => v[0]) as [OpsView, ...OpsView[]];

export const Route = createFileRoute("/_authenticated/ops/command-center")({
  validateSearch: (s) => z.object({ view: z.enum(views).optional().catch(undefined), filter: z.string().max(40).optional().catch(undefined) }).parse(s),
  head: () => ({ meta: [
    { title: "Operations Command Center - Harmonious" },
    { name: "description", content: "Harmonious internal operations: priorities, SLA, client and investor blockers, reporting, capital activity, capacity and service reviews." },
    { property: "og:title", content: "Operations Command Center - Harmonious" },
    { property: "og:description", content: "The daily internal workspace for Harmonious operations." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  component: Page,
});

function Page() {
  const { view, filter } = Route.useSearch();
  return <OpsCommandCenter view={view ?? "command"} filter={filter} />;
}
