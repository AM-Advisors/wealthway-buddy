import { createFileRoute } from "@tanstack/react-router";

import { FinancialReviewPackages } from "@/components/financial-review-packages";

export const Route = createFileRoute("/_authenticated/ops/financial-reviews")({
  head: () => ({
    meta: [
      { title: "Financial reviews - Harmonious Operations" },
      { name: "description", content: "Prepare and review quarterly and annual fund financial statement packages." },
      { property: "og:title", content: "Financial reviews - Harmonious Operations" },
      { property: "og:description", content: "Prepare, review and send statement packages for fund manager approval." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => <FinancialReviewPackages mode="staff" />,
});
