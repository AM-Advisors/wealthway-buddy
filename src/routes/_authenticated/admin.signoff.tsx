import { createFileRoute } from "@tanstack/react-router";

import { SignoffBoard } from "@/components/signoff-board";
import { listSignoffQueue } from "@/lib/signoff.functions";

export const Route = createFileRoute("/_authenticated/admin/signoff")({
  head: () => ({
    meta: [
      { title: "Sign-off — Harmonious" },
      {
        name: "description",
        content:
          "Approve or reject client requests: extra services, wire requests, agreements and invoice queries, in one queue.",
      },
      { property: "og:title", content: "Sign-off — Harmonious" },
      {
        property: "og:description",
        content: "One queue for everything a client is waiting on Harmonious to decide.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => listSignoffQueue(),
  errorComponent: ({ error }) => (
    <main className="mx-auto w-full max-w-3xl p-6 text-sm text-muted-foreground">
      {error.message}
    </main>
  ),
  notFoundComponent: () => (
    <main className="mx-auto w-full max-w-3xl p-6 text-sm text-muted-foreground">
      That page isn't available.
    </main>
  ),
  component: SignoffPage,
});

function SignoffPage() {
  const queue = Route.useLoaderData();
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-3xl">Sign-off</h1>
        <p className="text-sm text-muted-foreground">
          Everything a client is waiting on. Your decision and note go straight to their dashboard, and every
          decision is recorded with who made it and when. Existing checks still apply: nothing goes live without
          the client's signature, and money movement still needs two separate approvals.
        </p>
      </header>
      <SignoffBoard initial={queue} />
    </main>
  );
}
