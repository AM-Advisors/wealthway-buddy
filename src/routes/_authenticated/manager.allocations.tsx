import { createFileRoute } from "@tanstack/react-router";

import { AllocationBoard } from "@/components/allocation-board";

export const Route = createFileRoute("/_authenticated/manager/allocations")({
  head: () => ({
    meta: [
      { title: "Investor capital — Harmonious" },
      {
        name: "description",
        content:
          "See how your fund's net assets are shared out across investor capital accounts each period.",
      },
      { property: "og:title", content: "Investor capital — Harmonious" },
      {
        property: "og:description",
        content: "Investor capital accounts, commitments and statements for your funds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Investor capital</h1>
        <p className="text-sm text-muted-foreground">
          Review each period's investor capital accounts. You can acknowledge them or raise a
          challenge; Harmonious makes any change.
        </p>
      </header>
      <AllocationBoard role="manager" />
    </div>
  ),
});
