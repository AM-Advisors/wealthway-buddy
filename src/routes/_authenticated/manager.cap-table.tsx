import { createFileRoute } from "@tanstack/react-router";

import { CapTableEditor } from "@/components/cap-table-editor";

export const Route = createFileRoute("/_authenticated/manager/cap-table")({
  head: () => ({
    meta: [
      { title: "Cap Table — Harmonious Manager" },
      {
        name: "description",
        content:
          "Edit each investor's shares, committed capital and ownership percentage for a fund, with live totals.",
      },
      { property: "og:title", content: "Cap Table — Harmonious Manager" },
      {
        property: "og:description",
        content: "Investor ownership, shares and committed capital for each Harmonious fund.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <CapTableEditor backTo="/manager" />,
});
