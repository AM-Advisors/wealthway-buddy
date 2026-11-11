import { createFileRoute } from "@tanstack/react-router";

import { InvestorHome } from "@/components/investor-home";

export const Route = createFileRoute("/investor/")({
  head: () => ({
    meta: [
      { title: "My Investments | Harmonious Investor Portal" },
      { name: "description", content: "Every fund you are invested in, with commitments, documents and messages." },
      { property: "og:title", content: "My Investments | Harmonious Investor Portal" },
      { property: "og:description", content: "Your funds, commitments and documents in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvestorHome,
});
