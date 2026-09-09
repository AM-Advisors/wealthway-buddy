import { createFileRoute } from "@tanstack/react-router";

import { CapTableEditor } from "@/components/cap-table-editor";

export const Route = createFileRoute("/_authenticated/admin/cap-table")({
  head: () => ({
    meta: [
      { title: "Cap Table — Harmonious Admin" },
      {
        name: "description",
        content:
          "Edit each investor's shares, committed capital and ownership percentage for a fund, with live totals.",
      },
      { property: "og:title", content: "Cap Table — Harmonious Admin" },
      {
        property: "og:description",
        content: "Investor ownership, shares and committed capital for each Harmonious fund.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <CapTableEditor backTo="/admin" />,
});
