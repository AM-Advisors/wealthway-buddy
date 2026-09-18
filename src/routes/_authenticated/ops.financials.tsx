import { createFileRoute } from "@tanstack/react-router";

import { FinancialReportingBoard } from "@/components/financial-reporting-board";

export const Route = createFileRoute("/_authenticated/ops/financials")({
  head: () => ({
    meta: [
      { title: "Financial reporting — Harmonious" },
      {
        name: "description",
        content:
          "Prepare, review, approve and publish fund financial statements from the posted ledger, approved valuations and finalized investor capital.",
      },
      { property: "og:title", content: "Financial reporting — Harmonious" },
      {
        property: "og:description",
        content:
          "Reproducible financial statements with workpapers, close checklists and full drill-down to source records.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <FinancialReportingBoard role="harmonious" />,
});
