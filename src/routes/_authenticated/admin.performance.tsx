import { createFileRoute } from "@tanstack/react-router";

import { FundPerformanceBoard } from "@/components/fund-performance-board";

export const Route = createFileRoute("/_authenticated/admin/performance")({
  head: () => ({
    meta: [
      { title: "Performance — Harmonious admin" },
      {
        name: "description",
        content: "Return, IRR and cash flow over time for every fund on the platform.",
      },
      { property: "og:title", content: "Performance — Harmonious admin" },
      {
        property: "og:description",
        content: "Fund-by-fund return, IRR and cash flow, updating with every wire.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <FundPerformanceBoard backTo="/admin" />,
});
