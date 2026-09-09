import { createFileRoute } from "@tanstack/react-router";

import { OperationsBanking } from "@/components/operations-board";

export const Route = createFileRoute("/_authenticated/ops/banking")({
  head: () => ({
    meta: [
      { title: "Banking requests — Harmonious operations" },
      {
        name: "description",
        content: "Approve or send back each fund's request to have Harmonious open its bank account.",
      },
      { property: "og:title", content: "Banking requests — Harmonious operations" },
      {
        property: "og:description",
        content: "Track Mercury, Texas Capital and Customers Bank account openings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <OperationsBanking />,
});
