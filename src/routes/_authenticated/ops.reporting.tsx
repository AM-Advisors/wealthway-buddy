import { createFileRoute } from "@tanstack/react-router";

import { InvestorReportingBoard } from "@/components/investor-reporting-board";

export const Route = createFileRoute("/_authenticated/ops/reporting")({
  head: () => ({
    meta: [
      { title: "Investor reporting — Harmonious" },
      {
        name: "description",
        content:
          "Assemble, review, approve and publish investor reporting packages from approved records only.",
      },
      { property: "og:title", content: "Investor reporting — Harmonious" },
      {
        property: "og:description",
        content: "The reporting package queue, delivery status and amendments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <InvestorReportingBoard role="harmonious" />,
});
