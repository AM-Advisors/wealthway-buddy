import { createFileRoute, useParams } from "@tanstack/react-router";

import { OpsRecordPage } from "@/components/ops-record";

export const Route = createFileRoute("/_authenticated/ops/clients/$clientId")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Client 360 — Harmonious operations" },
      { name: "description", content: "Everything Harmonious holds for one client: relationships, funds, companies, documents and activity." },
      { property: "og:title", content: "Client 360 — Harmonious operations" },
      { property: "og:description", content: "Everything Harmonious holds for one client: relationships, funds, companies, documents and activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RecordRoute,
});

function RecordRoute() {
  const { clientId } = useParams({ from: "/_authenticated/ops/clients/$clientId" });
  return <OpsRecordPage type="client" id={clientId} />;
}
