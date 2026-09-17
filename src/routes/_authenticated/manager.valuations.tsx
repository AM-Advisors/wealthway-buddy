import { createFileRoute } from "@tanstack/react-router";

import { ValuationBoard } from "@/components/valuation-board";

export const Route = createFileRoute("/_authenticated/manager/valuations")({
  head: () => ({
    meta: [
      { title: "Fund valuations — Harmonious" },
      {
        name: "description",
        content: "Propose and review holding values for the funds you manage.",
      },
      { property: "og:title", content: "Fund valuations — Harmonious" },
      {
        property: "og:description",
        content: "Holding values, methods and evidence for the funds you manage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <ValuationBoard role="manager" />,
});
