import { createFileRoute } from "@tanstack/react-router";

import { AllocationBoard } from "@/components/allocation-board";

export const Route = createFileRoute("/_authenticated/ops/allocations")({
  head: () => ({
    meta: [
      { title: "Investor allocations — Harmonious" },
      {
        name: "description",
        content:
          "Share fund net assets out to investor capital accounts, reconcile them to the fund and issue capital account statements.",
      },
      { property: "og:title", content: "Investor allocations — Harmonious" },
      {
        property: "og:description",
        content: "Allocations, capital accounts and investor statements for each period.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Investor allocations</h1>
        <p className="text-sm text-muted-foreground">
          Capital accounts are produced from a published fund value and must add back to it exactly.
        </p>
      </header>
      <AllocationBoard role="harmonious" />
    </div>
  ),
});
