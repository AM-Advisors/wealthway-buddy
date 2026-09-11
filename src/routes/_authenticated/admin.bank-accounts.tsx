import { createFileRoute } from "@tanstack/react-router";

import { BankAccountsBoard } from "@/components/bank-accounts-board";

export const Route = createFileRoute("/_authenticated/admin/bank-accounts")({
  head: () => ({
    meta: [
      { title: "Bank accounts — Harmonious Admin" },
      {
        name: "description",
        content:
          "Record each fund's receiving account so incoming wires match the right fund and invoice.",
      },
      { property: "og:title", content: "Bank accounts — Harmonious Admin" },
      {
        property: "og:description",
        content: "Receiving account details for every fund, and deposits still waiting to match.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminBankAccountsPage,
});

function AdminBankAccountsPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Bank accounts</h1>
        <p className="text-sm text-muted-foreground">
          Keep each fund's receiving account on file so wire payments match automatically to the
          fund and its invoices.
        </p>
      </header>
      <BankAccountsBoard />
    </div>
  );
}
