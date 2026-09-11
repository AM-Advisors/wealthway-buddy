import { createFileRoute } from "@tanstack/react-router";

import { OnboardingProgressBoard } from "@/components/onboarding-progress-board";

export const Route = createFileRoute("/_authenticated/admin/onboarding-progress")({
  head: () => ({
    meta: [
      { title: "Onboarding progress — Harmonious admin" },
      {
        name: "description",
        content:
          "Track every client's sign-in, document sign-off, fund details and invoice status, and flag the engagements that have gone quiet.",
      },
      { property: "og:title", content: "Onboarding progress — Harmonious admin" },
      {
        property: "og:description",
        content: "Stage-by-stage onboarding progress for every Harmonious client.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-3xl">Onboarding progress</h1>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">
        Where every client has got to: invitation, first sign-in, the documents they accept, their
        fund details and their first invoice. Anything that has not moved for a while is flagged so
        it can be chased.
      </p>
      <OnboardingProgressBoard />
    </main>
  ),
});
