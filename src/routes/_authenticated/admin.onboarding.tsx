import { createFileRoute } from "@tanstack/react-router";

import { ClientOnboardingBoard } from "@/components/client-onboarding-board";

export const Route = createFileRoute("/_authenticated/admin/onboarding")({
  head: () => ({
    meta: [
      { title: "Client onboarding — Harmonious admin" },
      {
        name: "description",
        content:
          "Invite a new client's people, walk them through the privacy notice, terms, fee schedule and out-of-scope requests, and track their onboarding.",
      },
      { property: "og:title", content: "Client onboarding — Harmonious admin" },
      {
        property: "og:description",
        content: "Invite client contacts and track every onboarding step in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl">Client onboarding</h1>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">
        Invite the client's people, walk them through what they accept on first sign-in, show them
        how anything outside their statement of work is requested, and track how far each
        engagement has got.
      </p>
      <ClientOnboardingBoard />
    </main>
  ),
});
