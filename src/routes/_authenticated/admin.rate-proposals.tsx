import { createFileRoute } from "@tanstack/react-router";

import { RateProposalBoard } from "@/components/rate-proposal-board";

export const Route = createFileRoute("/_authenticated/admin/rate-proposals")({
  head: () => ({
    meta: [
      { title: "Rate proposals — Harmonious admin" },
      {
        name: "description",
        content:
          "Propose a fee to a client, track their approval and switch the service on so it can be invoiced.",
      },
      { property: "og:title", content: "Rate proposals — Harmonious admin" },
      {
        property: "og:description",
        content: "Send a written fee for a client's approval before any work is invoiced.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RateProposalsPage,
});

function RateProposalsPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rate proposals</h1>
        <p className="text-sm text-muted-foreground">
          Put a fee in front of a client, wait for their signed approval, then switch the service on so
          it flows into invoicing.
        </p>
      </div>
      <RateProposalBoard />
    </div>
  );
}
