import { createFileRoute } from "@tanstack/react-router";

import { FundPerformanceBoard } from "@/components/fund-performance-board";

export const Route = createFileRoute("/_authenticated/manager/performance")({
  head: () => ({
    meta: [
      { title: "Fund performance — Harmonious" },
      {
        name: "description",
        content: "Return, IRR and cash flow over time for the funds you manage.",
      },
      { property: "og:title", content: "Fund performance — Harmonious" },
      {
        property: "og:description",
        content: "Live fund return, IRR and cash flow as commitments and wires change.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <FundPerformanceBoard backTo="/manager" />,
});
