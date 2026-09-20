import { createFileRoute, useParams } from "@tanstack/react-router";

import { OpsRecordPage } from "@/components/ops-record";

export const Route = createFileRoute("/_authenticated/ops/companies/$companyId")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search["tab"] === "string" ? (search["tab"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Company 360 — Harmonious operations" },
      { name: "description", content: "One company: cap table, stakeholders, transactions, documents and reports." },
      { property: "og:title", content: "Company 360 — Harmonious operations" },
      { property: "og:description", content: "One company: cap table, stakeholders, transactions, documents and reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RecordRoute,
});

function RecordRoute() {
  const { companyId } = useParams({ from: "/_authenticated/ops/companies/$companyId" });
  return <OpsRecordPage type="company" id={companyId} />;
}
