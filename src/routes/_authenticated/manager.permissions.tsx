import { createFileRoute } from "@tanstack/react-router";

import { DocumentPermissionsBoard } from "@/components/document-permissions-board";

export const Route = createFileRoute("/_authenticated/manager/permissions")({
  head: () => ({
    meta: [
      { title: "Document Permissions — Harmonious Manager" },
      {
        name: "description",
        content:
          "Choose which diligence room documents each investor can open, and who may see the cap table.",
      },
      { property: "og:title", content: "Document Permissions — Harmonious Manager" },
      {
        property: "og:description",
        content: "Per-investor document access for each Harmonious fund's diligence room.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <DocumentPermissionsBoard backTo="/manager" />,
});
