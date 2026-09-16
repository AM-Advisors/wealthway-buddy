import { createFileRoute } from "@tanstack/react-router";

import { CapTableRequestsBoard } from "@/components/cap-table-requests-board";

export const Route = createFileRoute("/_authenticated/admin/cap-table-requests")({
  head: () => ({
    meta: [
      { title: "Cap Table Requests — Harmonious Admin" },
      {
        name: "description",
        content:
          "Founders who asked to move their cap table to Harmonious: who they are, where their records live today and how far the conversation has got.",
      },
      { property: "og:title", content: "Cap Table Requests — Harmonious Admin" },
      {
        property: "og:description",
        content: "Track and work every cap table migration request from the website.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CapTableRequestsBoard,
});
