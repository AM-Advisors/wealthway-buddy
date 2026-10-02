import { createFileRoute } from "@tanstack/react-router";

import { CapTableEditor } from "@/components/cap-table-editor";

export const Route = createFileRoute("/_authenticated/ops/cap-tables")({
  head: () => ({
    meta: [
      { title: "Cap Tables - Harmonious Operations" },
      {
        name: "description",
        content:
          "Investor ownership, shares and committed capital for every fund Harmonious administers.",
      },
      { property: "og:title", content: "Cap Tables - Harmonious Operations" },
      {
        property: "og:description",
        content:
          "Investor ownership, shares and committed capital for every fund Harmonious administers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <CapTableEditor />,
});
