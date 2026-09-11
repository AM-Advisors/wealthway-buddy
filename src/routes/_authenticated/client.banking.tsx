import { createFileRoute } from "@tanstack/react-router";

import { ClientBankLinking } from "@/components/client-bank-linking";

export const Route = createFileRoute("/_authenticated/client/banking")({
  head: () => ({
    meta: [
      { title: "Bank accounts — Harmonious Client Portal" },
      {
        name: "description",
        content:
          "Link your fund's bank account so the wires and ACH payments you send are matched to your Harmonious invoices automatically.",
      },
      { property: "og:title", content: "Bank accounts — Harmonious Client Portal" },
      {
        property: "og:description",
        content: "Link a bank account so your payments match your invoices automatically.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientBankingPage,
});

function ClientBankingPage() {
  return <ClientBankLinking />;
}
