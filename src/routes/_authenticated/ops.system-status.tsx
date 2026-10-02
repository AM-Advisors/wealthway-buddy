import { createFileRoute } from "@tanstack/react-router";

import { SystemStatus } from "@/components/ops-health";

export const Route = createFileRoute("/_authenticated/ops/system-status")({
  head: () => ({
    meta: [
      { title: "System status - Harmonious Operations" },
      { name: "description", content: "Whether the app and backend are responding." },
      { property: "og:title", content: "System status - Harmonious Operations" },
      { property: "og:description", content: "Whether the app and backend are responding." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SystemStatus,
});
