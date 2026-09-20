import { createFileRoute } from "@tanstack/react-router";

import { OperationsWorkHome } from "@/components/ops-home";

export const Route = createFileRoute("/_authenticated/ops/")({
  head: () => ({
    meta: [
      { title: "Operations — Harmonious" },
      {
        name: "description",
        content: "Fund banking requests, EINs and tax documents waiting on the operations team.",
      },
      { property: "og:title", content: "Operations — Harmonious" },
      {
        property: "og:description",
        content: "Review fund banking, EINs and tax paperwork before managers see it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OperationsWorkHome,
});
