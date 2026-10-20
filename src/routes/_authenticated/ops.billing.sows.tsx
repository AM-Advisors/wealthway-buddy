import { createFileRoute } from "@tanstack/react-router";

import { BillingPipeline } from "@/components/ops-billing-pipeline";

export const Route = createFileRoute("/_authenticated/ops/billing/sows")({
  head: () => ({
    meta: [
      { title: "Client statements of work - Harmonious Operations" },
      { name: "description", content: "Every signed quote with its statement of work, approval, client signature and billing schedule." },
      { property: "og:title", content: "Client statements of work - Harmonious Operations" },
      { property: "og:description", content: "Signed quotes and their statements of work and billing schedules." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-3xl">Client statements of work</h1>
        <p className="text-sm text-muted-foreground">Starting from each signed quote: the statement of work, who has approved and signed it, and what it bills.</p>
      </header>
      <BillingPipeline view="sows" />
    </main>
  ),
});
