import { createFileRoute } from "@tanstack/react-router";

import { OperationsTeam } from "@/components/operations-board";

export const Route = createFileRoute("/_authenticated/ops/team")({
  head: () => ({
    meta: [
      { title: "Operations team — Harmonious" },
      {
        name: "description",
        content: "Who can review fund banking, EINs and tax paperwork at Harmonious.",
      },
      { property: "og:title", content: "Operations team — Harmonious" },
      { property: "og:description", content: "Add or remove operations staff." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OperationsTeam,
});
