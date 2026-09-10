import { createFileRoute } from "@tanstack/react-router";

import { ClientScopeBoard } from "@/components/client-scope-board";

export const Route = createFileRoute("/_authenticated/admin/contracts/$clientId")({
  head: () => ({
    meta: [
      { title: "Client scope — Harmonious admin" },
      {
        name: "description",
        content:
          "The statements of work, services in scope, responsibilities and contracted fees for one Harmonious client.",
      },
      { property: "og:title", content: "Client scope — Harmonious admin" },
      {
        property: "og:description",
        content: "Statements of work, service scope and contracted fees for one client.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClientScopeRoute,
});

function ClientScopeRoute() {
  const { clientId } = Route.useParams();
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <ClientScopeBoard clientId={clientId} />
    </main>
  );
}
