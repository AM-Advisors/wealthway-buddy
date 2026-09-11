import { createFileRoute } from "@tanstack/react-router";

import { ClientWireRequestsPanel } from "@/components/client-wire-requests-panel";
import { useClientPortal } from "@/components/client-portal-context";

export const Route = createFileRoute("/_authenticated/client/wires")({
  head: () => ({
    meta: [
      { title: "Wire requests — Harmonious" },
      {
        name: "description",
        content:
          "Request an outbound wire or ACH from a fund we administer and track Harmonious's checks and approvals.",
      },
      { property: "og:title", content: "Wire requests — Harmonious" },
      {
        property: "og:description",
        content: "Request outbound wires and track Harmonious's checks and approvals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientWiresPage,
});

function ClientWiresPage() {
  const { data } = useClientPortal();
  return (
    <ClientWireRequestsPanel
      requests={(data?.wireRequests ?? []) as any[]}
      funds={(data?.funds ?? []) as any[]}
      canRequest={!!(data as any)?.canRequestWire}
    />
  );
}
