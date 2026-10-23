import { createFileRoute } from "@tanstack/react-router";

import { ClientSowPanel } from "@/components/client-sow-panel";
import { useClientPortal } from "@/components/client-portal-context";

export const Route = createFileRoute("/_authenticated/client/statements-of-work")({
  head: () => ({
    meta: [
      { title: "Statements of work | Harmonious" },
      { name: "description", content: "Review, sign or send back your statements of work with Harmonious." },
      { property: "og:title", content: "Statements of work | Harmonious" },
      { property: "og:description", content: "Review and sign your statements of work." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StatementsOfWorkPage,
});

function StatementsOfWorkPage() {
  const { data } = useClientPortal();
  const sows = ((data as any)?.sows ?? []) as any[];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl">Statements of work</h1>
      {sows.length ? <ClientSowPanel sows={sows} /> : <p className="text-sm text-muted-foreground">No statements of work yet.</p>}
    </div>
  );
}
