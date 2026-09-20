import { createFileRoute } from "@tanstack/react-router";

import { OpsRecordList } from "@/components/ops-record";

export const Route = createFileRoute("/_authenticated/ops/companies/")({
  head: () => ({
    meta: [
      { title: "Companies — Harmonious operations" },
      { name: "description", content: "Every company whose cap table Harmonious administers." },
      { property: "og:title", content: "Companies — Harmonious operations" },
      { property: "og:description", content: "Every company whose cap table Harmonious administers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <OpsRecordList type="company" />,
});
