import { createFileRoute } from "@tanstack/react-router";

import { PerformanceReportingBoard } from "@/components/performance-reporting-board";

export const Route = createFileRoute("/_authenticated/ops/performance")({
  head: () => ({
    meta: [
      { title: "Performance reporting — Harmonious operations" },
      {
        name: "description",
        content:
          "Prepare, review, approve and publish fund and investor performance from approved accounting records.",
      },
      { property: "og:title", content: "Performance reporting — Harmonious operations" },
      {
        property: "og:description",
        content: "Fund and investor return measures derived from posted accounting and approved NAV.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <PerformanceReportingBoard role="harmonious" />,
});
