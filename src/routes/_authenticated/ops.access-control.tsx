import { createFileRoute } from "@tanstack/react-router";

import { AccessControlCenter } from "@/components/access-control-center";

export const Route = createFileRoute("/_authenticated/ops/access-control")({
  head: () => ({
    meta: [
      { title: "Access Control - Harmonious Operations" },
      { name: "description", content: "Who can do what across Harmonious, and why: people, roles, permission matrix and access audit." },
      { property: "og:title", content: "Access Control - Harmonious Operations" },
      { property: "og:description", content: "A read-only view of every person's effective access and its source." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccessControlCenter,
});
