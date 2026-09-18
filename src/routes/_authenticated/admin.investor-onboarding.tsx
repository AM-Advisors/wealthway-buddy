import { createFileRoute } from "@tanstack/react-router";

import { InvestorOnboardingOps } from "@/components/investor-onboarding-ops";

export const Route = createFileRoute("/_authenticated/admin/investor-onboarding")({
  head: () => ({
    meta: [
      { title: "Investor onboarding review — Harmonious admin" },
      {
        name: "description",
        content:
          "Review each investor's checks, approve them to fund, accept their subscription and admit them to the fund.",
      },
      { property: "og:title", content: "Investor onboarding review — Harmonious admin" },
      {
        property: "og:description",
        content: "Harmonious review queue for investor subscriptions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-3xl">Investor onboarding</h1>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">
        Everything waiting on Harmonious: checks to review, subscriptions to approve, money to
        confirm and investors to admit.
      </p>
      <InvestorOnboardingOps />
    </main>
  ),
});
