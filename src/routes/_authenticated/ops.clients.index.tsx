import { createFileRoute } from "@tanstack/react-router";

import { OpsRecordList } from "@/components/ops-record";

export const Route = createFileRoute("/_authenticated/ops/clients/")({
  head: () => ({
    meta: [
      { title: "Clients — Harmonious operations" },
      { name: "description", content: "Every client Harmonious administers, with their funds, companies and people." },
      { property: "og:title", content: "Clients — Harmonious operations" },
      { property: "og:description", content: "Every client Harmonious administers, with their funds, companies and people." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <OpsRecordList type="client" />,
});
