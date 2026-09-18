import { createFileRoute } from "@tanstack/react-router";

import { InvestorFinancialsPanel } from "@/components/investor-financials-panel";

export const Route = createFileRoute("/_authenticated/investor-financials")({
  head: () => ({
    meta: [
      { title: "Fund reports — Harmonious" },
      {
        name: "description",
        content: "Financial reports published to you for the funds you are invested in.",
      },
      { property: "og:title", content: "Fund reports — Harmonious" },
      {
        property: "og:description",
        content: "Published fund financial reports for your investments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvestorFinancialsPanel,
});
