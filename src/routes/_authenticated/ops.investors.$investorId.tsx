import { createFileRoute, useParams } from "@tanstack/react-router";

import { OpsRecordPage } from "@/components/ops-record";

export const Route = createFileRoute("/_authenticated/ops/investors/$investorId")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search["tab"] === "string" ? (search["tab"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Investor 360 — Harmonious operations" },
      { name: "description", content: "One investor relationship: profiles, investments, capital, tax, documents and identity checks." },
      { property: "og:title", content: "Investor 360 — Harmonious operations" },
      { property: "og:description", content: "One investor relationship: profiles, investments, capital, tax, documents and identity checks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RecordRoute,
});

function RecordRoute() {
  const { investorId } = useParams({ from: "/_authenticated/ops/investors/$investorId" });
  return <OpsRecordPage type="investor" id={investorId} />;
}
