import { createFileRoute } from "@tanstack/react-router";

import { ClientInbox } from "@/components/client-inbox";

export const Route = createFileRoute("/_authenticated/client/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox — Harmonious Client Portal" },
      {
        name: "description",
        content:
          "Every notice Harmonious sends you — invoices, payment reminders and decisions — readable inside your client portal.",
      },
      { property: "og:title", content: "Inbox — Harmonious Client Portal" },
      {
        property: "og:description",
        content: "Invoices, reminders and notices from Harmonious in your portal inbox.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientInboxPage,
});

function ClientInboxPage() {
  return <ClientInbox />;
}
