import { createFileRoute } from "@tanstack/react-router";

import { OpsRecordList } from "@/components/ops-record";

export const Route = createFileRoute("/_authenticated/ops/funds/")({
  head: () => ({
    meta: [
      { title: "Funds & SPVs — Harmonious operations" },
      { name: "description", content: "Every fund and SPV Harmonious administers." },
      { property: "og:title", content: "Funds & SPVs — Harmonious operations" },
      { property: "og:description", content: "Every fund and SPV Harmonious administers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <OpsRecordList type="fund" />,
});
