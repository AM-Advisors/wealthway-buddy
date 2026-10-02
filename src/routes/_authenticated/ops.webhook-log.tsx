import { createFileRoute } from "@tanstack/react-router";

import { WebhookLog } from "@/components/ops-health";

export const Route = createFileRoute("/_authenticated/ops/webhook-log")({
  head: () => ({
    meta: [
      { title: "Webhook log - Harmonious Operations" },
      { name: "description", content: "Updates received from identity checks, Box Sign and Plaid." },
      { property: "og:title", content: "Webhook log - Harmonious Operations" },
      { property: "og:description", content: "Updates received from identity checks, Box Sign and Plaid." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: WebhookLog,
});
