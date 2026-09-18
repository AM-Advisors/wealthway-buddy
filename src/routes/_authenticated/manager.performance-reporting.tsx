import { createFileRoute } from "@tanstack/react-router";

import { PerformanceReportingBoard } from "@/components/performance-reporting-board";

export const Route = createFileRoute("/_authenticated/manager/performance-reporting")({
  head: () => ({
    meta: [
      { title: "Published performance — Harmonious" },
      {
        name: "description",
        content:
          "Published performance for the funds you manage, with the figures behind every return measure.",
      },
      { property: "og:title", content: "Published performance — Harmonious" },
      {
        property: "og:description",
        content: "Review, acknowledge or challenge published fund and investor performance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <PerformanceReportingBoard role="manager" />,
});
