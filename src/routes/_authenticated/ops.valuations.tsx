import { createFileRoute } from "@tanstack/react-router";

import { ValuationBoard } from "@/components/valuation-board";

export const Route = createFileRoute("/_authenticated/ops/valuations")({
  head: () => ({
    meta: [
      { title: "Valuation review — Harmonious" },
      {
        name: "description",
        content:
          "Review, approve and make effective every portfolio valuation, with method, evidence and history.",
      },
      { property: "og:title", content: "Valuation review — Harmonious" },
      {
        property: "og:description",
        content: "Harmonious valuation governance: methodology, evidence, approval and accounting impact.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <ValuationBoard role="harmonious" />,
});
