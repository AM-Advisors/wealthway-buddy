import { createFileRoute } from "@tanstack/react-router";

import { PortfolioValueBoard } from "@/components/portfolio-value-board";

export const Route = createFileRoute("/_authenticated/admin/portfolio-value")({
  head: () => ({
    meta: [
      { title: "Portfolio value — Harmonious" },
      {
        name: "description",
        content:
          "Equity value per share for every fund, updating as commitments and received funds change.",
      },
      { property: "og:title", content: "Portfolio value — Harmonious" },
      {
        property: "og:description",
        content: "Live fund equity value and value per share across the portfolio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <PortfolioValueBoard backTo="/admin" />,
});
