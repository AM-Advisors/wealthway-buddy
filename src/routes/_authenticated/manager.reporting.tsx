import { createFileRoute } from "@tanstack/react-router";

import { InvestorReportingBoard } from "@/components/investor-reporting-board";

export const Route = createFileRoute("/_authenticated/manager/reporting")({
  head: () => ({
    meta: [
      { title: "Investor packages — Harmonious" },
      {
        name: "description",
        content: "Published investor reporting packages for the funds you manage.",
      },
      { property: "og:title", content: "Investor packages — Harmonious" },
      {
        property: "og:description",
        content: "Review, acknowledge or challenge the reporting packages sent to your investors.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <InvestorReportingBoard role="manager" />,
});
