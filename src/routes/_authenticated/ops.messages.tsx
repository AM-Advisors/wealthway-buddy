import { createFileRoute, Link } from "@tanstack/react-router";

import { SupportInbox } from "@/components/support-inbox";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/ops/messages")({
  head: () => ({
    meta: [
      { title: "Messages - Harmonious Operations" },
      { name: "description", content: "Answer questions from fund managers and investors sent to the Harmonious team." },
      { property: "og:title", content: "Messages - Harmonious Operations" },
      { property: "og:description", content: "One inbox for fund manager and investor questions to Harmonious." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OpsMessages,
});

function OpsMessages() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Messages</h1>
          <p className="mt-1 text-sm text-muted-foreground">Questions from fund managers and investors to the Harmonious team.</p>
        </div>
        <Button asChild variant="outline" size="sm"><Link to="/admin/requests">Client requests & messages</Link></Button>
      </div>
      <SupportInbox mode="staff" />
    </main>
  );
}
