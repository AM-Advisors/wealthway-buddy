import { createFileRoute } from "@tanstack/react-router";

import { ManagerWireBoard } from "@/components/manager-wire-board";

export const Route = createFileRoute("/_authenticated/manager/wires")({
  head: () => ({
    meta: [
      { title: "Wire Review Board | Harmonious Manager" },
      {
        name: "description",
        content:
          "Every wire confirmation your investors submit, with one-click approve or send back and the current funding status.",
      },
      { property: "og:title", content: "Wire Review Board | Harmonious Manager" },
      {
        property: "og:description",
        content: "Approve or send back investor wire confirmations in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <ManagerWireBoard />,
});
