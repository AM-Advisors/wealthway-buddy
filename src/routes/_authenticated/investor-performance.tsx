import { createFileRoute } from "@tanstack/react-router";

import { InvestorPerformancePanel } from "@/components/investor-performance-panel";

export const Route = createFileRoute("/_authenticated/investor-performance")({
  head: () => ({
    meta: [
      { title: "Your performance — Harmonious" },
      {
        name: "description",
        content:
          "How each of your investments has performed, calculated from your own contributions and distributions.",
      },
      { property: "og:title", content: "Your performance — Harmonious" },
      {
        property: "og:description",
        content: "Your investment performance, shown separately from fund-level performance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvestorPerformancePanel,
});
