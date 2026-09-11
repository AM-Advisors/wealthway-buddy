import { createFileRoute } from "@tanstack/react-router";

import { ClientActivityBoard } from "@/components/client-activity-board";

export const Route = createFileRoute("/_authenticated/admin/client-activity")({
  head: () => ({
    meta: [
      { title: "Client portal activity — Harmonious" },
      {
        name: "description",
        content:
          "A timestamped record of what each client did in their portal: fund setup, documents signed, invoice approvals and payments reported.",
      },
      { property: "og:title", content: "Client portal activity — Harmonious" },
      {
        property: "og:description",
        content: "Fund setup, signing, invoice approvals and payments, with timestamps, by client.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClientActivityPage,
});

function ClientActivityPage() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-3xl">Client portal activity</h1>
        <p className="text-sm text-muted-foreground">
          What each client has done in their own portal, with the date and time: fund setup details,
          documents and sign-offs signed, invoices approved or queried, payments reported and
          service requests raised. Harmonious keeps the record; nothing here changes a client's
          scope or moves money.
        </p>
      </header>
      <ClientActivityBoard />
    </main>
  );
}
