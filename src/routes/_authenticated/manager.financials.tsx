import { createFileRoute } from "@tanstack/react-router";

import { FinancialReportingBoard } from "@/components/financial-reporting-board";

export const Route = createFileRoute("/_authenticated/manager/financials")({
  head: () => ({
    meta: [
      { title: "Fund financials — Harmonious" },
      {
        name: "description",
        content:
          "Published financial statements, NAV packages and capital summaries for the funds you manage.",
      },
      { property: "og:title", content: "Fund financials — Harmonious" },
      {
        property: "og:description",
        content: "Review, acknowledge or challenge the financial statements published for your funds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <FinancialReportingBoard role="manager" />,
});
