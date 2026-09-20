import { createFileRoute, useParams } from "@tanstack/react-router";

import { OpsRecordPage } from "@/components/ops-record";

export const Route = createFileRoute("/_authenticated/ops/fund/$fundId")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Fund 360 — Harmonious operations" },
      { name: "description", content: "One fund or SPV: investors, capital, banking, accounting, tax, regulatory and documents." },
      { property: "og:title", content: "Fund 360 — Harmonious operations" },
      { property: "og:description", content: "One fund or SPV: investors, capital, banking, accounting, tax, regulatory and documents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RecordRoute,
});

function RecordRoute() {
  const { fundId } = useParams({ from: "/_authenticated/ops/fund/$fundId" });
  return <OpsRecordPage type="fund" id={fundId} />;
}
