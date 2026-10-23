import { createFileRoute } from "@tanstack/react-router";

import { EmailHealth } from "@/components/ops-health";

export const Route = createFileRoute("/_authenticated/ops/email-health")({
  head: () => ({
    meta: [
      { title: "Email delivery - Harmonious Operations" },
      { name: "description", content: "Bounced, failed and delivered platform emails, read-only." },
      { property: "og:title", content: "Email delivery - Harmonious Operations" },
      { property: "og:description", content: "Bounced, failed and delivered platform emails, read-only." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EmailHealth,
});
