import { createFileRoute } from "@tanstack/react-router";

import { FinancialReviewPackages } from "@/components/financial-review-packages";

export const Route = createFileRoute("/_authenticated/manager/financial-reviews")({
  head: () => ({
    meta: [
      { title: "Financial reviews - Harmonious" },
      { name: "description", content: "Approve the quarterly and annual financial statements for the funds you manage." },
      { property: "og:title", content: "Financial reviews - Harmonious" },
      { property: "og:description", content: "Quarterly and annual statement packages awaiting your approval." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <FinancialReviewPackages mode="manager" />,
});
