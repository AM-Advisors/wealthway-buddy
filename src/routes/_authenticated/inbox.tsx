import { createFileRoute } from "@tanstack/react-router";
import { UnifiedInbox } from "@/components/unified-inbox";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox - Harmonious" },
      { name: "description", content: "Message Harmonious Operations, Sales or your dedicated representative, and read notices we send you." },
      { property: "og:title", content: "Inbox - Harmonious" },
      { property: "og:description", content: "Conversations and notices with Harmonious in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UnifiedInbox,
});
