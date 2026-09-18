import { createFileRoute } from "@tanstack/react-router";

import { InvestorOnboardingManagerBoard } from "@/components/investor-onboarding-manager-board";

export const Route = createFileRoute("/_authenticated/manager/investor-onboarding")({
  head: () => ({
    meta: [
      { title: "Investors joining your funds — Harmonious" },
      {
        name: "description",
        content: "Track how far each investor has got in joining the funds you manage.",
      },
      { property: "og:title", content: "Investors joining your funds — Harmonious" },
      { property: "og:description", content: "Manager view of investor onboarding progress." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl">Investors joining your funds</h1>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">
        Progress for each investor in the funds you manage.
      </p>
      <InvestorOnboardingManagerBoard />
    </main>
  ),
});
