import { createFileRoute } from "@tanstack/react-router";

import { OperationsTaxDocuments } from "@/components/operations-board";

export const Route = createFileRoute("/_authenticated/ops/tax-documents")({
  head: () => ({
    meta: [
      { title: "Tax documents — Harmonious operations" },
      {
        name: "description",
        content: "Upload and approve fund W-9s, W-8s and K-1s before managers can see them.",
      },
      { property: "og:title", content: "Tax documents — Harmonious operations" },
      {
        property: "og:description",
        content: "A reviewed store of every fund and investor tax form.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <OperationsTaxDocuments />,
});
