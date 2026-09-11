import { createFileRoute } from "@tanstack/react-router";

import { ClientPaymentsPanel } from "@/components/client-payments-panel";
import { useClientPortal } from "@/components/client-portal-context";

export const Route = createFileRoute("/_authenticated/client/payments")({
  head: () => ({
    meta: [
      { title: "Payments — Harmonious" },
      {
        name: "description",
        content:
          "Payments Harmonious has approved and processed under your statement of work, with status and references.",
      },
      { property: "og:title", content: "Payments — Harmonious" },
      {
        property: "og:description",
        content: "Approved payments and their status under your agreement.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientPaymentsPage,
});

function ClientPaymentsPage() {
  const { data } = useClientPortal();
  return <ClientPaymentsPanel payments={(data?.payments ?? []) as any[]} />;
}
