import { createFileRoute } from "@tanstack/react-router";

import { InvestorOnboardingJourney } from "@/components/investor-onboarding-journey";

export const Route = createFileRoute("/_authenticated/investment/$onboardingId")({
  head: () => ({
    meta: [
      { title: "Your investment — Harmonious" },
      {
        name: "description",
        content:
          "Complete your investment: who is investing, how much, your checks, your subscription documents and funding.",
      },
      { property: "og:title", content: "Your investment — Harmonious" },
      { property: "og:description", content: "Complete your subscription in the Harmonious portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { step?: string } =>
    typeof search["step"] === "string" ? { step: search["step"] as string } : {},
  component: InvestmentPage,
});

function InvestmentPage() {
  const { onboardingId } = Route.useParams();
  const { step } = Route.useSearch();
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <InvestorOnboardingJourney onboardingId={onboardingId} requestedStep={step} />
    </main>
  );
}
