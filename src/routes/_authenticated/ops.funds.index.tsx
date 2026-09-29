import { RelatedPersonReviews } from "@/components/related-person-reviews";
import { createFileRoute } from "@tanstack/react-router";
import type { FundFilter } from "@/lib/ops-funds-model";

const FILTERS: FundFilter[] = ["all", "active", "onboarding", "needs_harmonious", "blocked", "ready", "closing_soon", "agreement_follow_up"];

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
  validateSearch: (s: Record<string, unknown>): { filter?: FundFilter | undefined } => ({ filter: FILTERS.includes(s["filter"] as FundFilter) ? (s["filter"] as FundFilter) : undefined }),
  component: Page,
});

function Page() {
  const { filter } = Route.useSearch();
  return (
    <>
      <OpsFundsDashboard key={filter ?? "all"} initialFilter={filter} />
      <div id="related-person-reviews" className="mx-auto max-w-6xl px-4 pb-10"><RelatedPersonReviews /></div>
    </>
  );
}
