import { RelatedPersonReviews } from "@/components/related-person-reviews";
import { createFileRoute } from "@tanstack/react-router";

import { OpsFundsDashboard } from "@/components/ops-funds-dashboard";

export const Route = createFileRoute("/_authenticated/ops/funds/")({
  head: () => ({
    meta: [
      { title: "Funds & SPVs — Harmonious operations" },
      { name: "description", content: "Which funds need attention, who is onboarding, and what is next." },
      { property: "og:title", content: "Funds & SPVs — Harmonious operations" },
      { property: "og:description", content: "Which funds need attention, who is onboarding, and what is next." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <>
      <OpsFundsDashboard />
      <div className="mx-auto max-w-6xl px-4 pb-10"><RelatedPersonReviews /></div>
    </>
  ),
});
