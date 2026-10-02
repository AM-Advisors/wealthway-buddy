import { createFileRoute } from "@tanstack/react-router";

import { SupportInbox } from "@/components/support-inbox";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({
    meta: [
      { title: "Message Harmonious - Investor portal" },
      { name: "description", content: "Ask the Harmonious team a question and see their replies." },
      { property: "og:title", content: "Message Harmonious" },
      { property: "og:description", content: "Private conversations with the Harmonious team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-3xl">Messages</h1>
      <p className="mb-6 text-sm text-muted-foreground">Ask the Harmonious team anything about your investments. Questions about a specific Fund's terms can also go to that Fund's manager from your investment page.</p>
      <SupportInbox mode="investor" />
    </main>
  ),
});
