import { createFileRoute } from "@tanstack/react-router";

import { CapTableBoard } from "@/components/cap-table-board";

export const Route = createFileRoute("/_authenticated/admin/cap-table-board")({
  head: () => ({
    meta: [
      { title: "Cap Table Board — Harmonious Admin" },
      {
        name: "description",
        content:
          "Every Harmonious fund's cap table on one board: investor names, committed amounts, funds received and share percentages, editable in place.",
      },
      { property: "og:title", content: "Cap Table Board — Harmonious Admin" },
      {
        property: "og:description",
        content: "All funds, all investors: committed, received and ownership in one editable view.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <CapTableBoard backTo="/admin" />,
});
