import { createFileRoute } from "@tanstack/react-router";

import { ClientBankAccountsBoard } from "@/components/client-bank-accounts-board";

export const Route = createFileRoute("/_authenticated/admin/client-bank-accounts")({
  head: () => ({
    meta: [
      { title: "Client bank accounts — Harmonious Admin" },
      {
        name: "description",
        content:
          "Record the account each client pays from so portal payments settle their invoices automatically.",
      },
      { property: "og:title", content: "Client bank accounts — Harmonious Admin" },
      {
        property: "og:description",
        content: "Paying account details for every client, kept for automatic invoice matching.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminClientBankAccountsPage,
});

function AdminClientBankAccountsPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Client bank accounts</h1>
        <p className="text-sm text-muted-foreground">
          Keep the account each client pays from on file. Deposits carrying their account holder
          name, usual reference or last four digits settle the invoice they declared in the portal.
          Only the last four digits are stored.
        </p>
      </header>
      <ClientBankAccountsBoard />
    </div>
  );
}
