import { createFileRoute } from "@tanstack/react-router";

import { CapTableBoard } from "@/components/cap-table-board";

export const Route = createFileRoute("/_authenticated/manager/cap-table-board")({
  head: () => ({
    meta: [
      { title: "Cap Table Board — Harmonious Manager" },
      {
        name: "description",
        content:
          "Your funds' cap tables on one board: investor names, committed amounts, funds received and share percentages, editable in place.",
      },
      { property: "og:title", content: "Cap Table Board — Harmonious Manager" },
      {
        property: "og:description",
        content: "All your funds, all investors: committed, received and ownership in one view.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <CapTableBoard backTo="/manager" />,
});
