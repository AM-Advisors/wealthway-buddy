import { createFileRoute } from "@tanstack/react-router";

import { NavBoard } from "@/components/nav-board";

export const Route = createFileRoute("/_authenticated/ops/nav")({
  head: () => ({
    meta: [
      { title: "NAV review — Harmonious" },
      {
        name: "description",
        content:
          "Calculate, review, approve and publish fund net asset value from the ledger and approved valuations.",
      },
      { property: "og:title", content: "NAV review — Harmonious" },
      {
        property: "og:description",
        content: "Reproducible NAV with pre-NAV checks, a reconciling bridge and immutable snapshots.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <NavBoard role="harmonious" />,
});
