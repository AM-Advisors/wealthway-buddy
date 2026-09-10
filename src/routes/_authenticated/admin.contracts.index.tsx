import { createFileRoute } from "@tanstack/react-router";

import { ClientsBoard } from "@/components/clients-board";

export const Route = createFileRoute("/_authenticated/admin/contracts/")({
  head: () => ({
    meta: [
      { title: "Clients and scope — Harmonious admin" },
      {
        name: "description",
        content:
          "Every Harmonious client, their master agreement, statements of work and the services included in each engagement.",
      },
      { property: "og:title", content: "Clients and scope — Harmonious admin" },
      {
        property: "og:description",
        content: "Client agreements, statements of work and service scope in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl">Clients and scope</h1>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">
        Every engagement runs on a master agreement plus its own statement of work. Only services
        recorded here are offered to the client.
      </p>
      <ClientsBoard />
    </main>
  ),
});
