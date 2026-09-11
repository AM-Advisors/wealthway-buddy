import { createFileRoute } from "@tanstack/react-router";

import { UnpaidInvoicesBoard } from "@/components/unpaid-invoices-board";

export const Route = createFileRoute("/_authenticated/admin/invoices")({
  head: () => ({
    meta: [
      { title: "Unpaid invoices — Harmonious" },
      {
        name: "description",
        content:
          "Every client invoice still awaiting payment, with the amount, due date and the portal link the client uses to pay.",
      },
      { property: "og:title", content: "Unpaid invoices — Harmonious" },
      {
        property: "og:description",
        content: "Outstanding client invoices by client, with amounts, due dates and portal links.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminInvoicesPage,
});

function AdminInvoicesPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-3xl">Unpaid invoices</h1>
        <p className="text-sm text-muted-foreground">
          What each client still owes, grouped by client, with the due date and the portal link they
          use to approve and confirm payment. Harmonious records payment once the funds arrive.
        </p>
      </header>
      <UnpaidInvoicesBoard />
    </main>
  );
}
