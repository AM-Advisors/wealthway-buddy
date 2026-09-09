import { createFileRoute } from "@tanstack/react-router";

import { PortfolioValueBoard } from "@/components/portfolio-value-board";

export const Route = createFileRoute("/_authenticated/manager/portfolio-value")({
  head: () => ({
    meta: [
      { title: "Portfolio value — Harmonious" },
      {
        name: "description",
        content: "Equity value per share for the funds you manage, updating with every wire.",
      },
      { property: "og:title", content: "Portfolio value — Harmonious" },
      {
        property: "og:description",
        content: "Live fund equity value and value per share for your assigned funds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <PortfolioValueBoard backTo="/manager" />,
});
