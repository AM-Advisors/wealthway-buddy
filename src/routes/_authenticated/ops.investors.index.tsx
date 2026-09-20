import { createFileRoute } from "@tanstack/react-router";

import { OpsRecordList } from "@/components/ops-record";

export const Route = createFileRoute("/_authenticated/ops/investors/")({
  head: () => ({
    meta: [
      { title: "Investors — Harmonious operations" },
      { name: "description", content: "Every investor relationship, with profiles, investments and checks." },
      { property: "og:title", content: "Investors — Harmonious operations" },
      { property: "og:description", content: "Every investor relationship, with profiles, investments and checks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <OpsRecordList type="investor" />,
});
