import { createFileRoute } from "@tanstack/react-router";

import { ConciergeWorkspace } from "@/components/captable/concierge-workspace";

export const Route = createFileRoute("/_authenticated/admin/cap-table-migrations")({
  head: () => ({
    meta: [
      { title: "Migration Concierge — Harmonious Admin" },
      {
        name: "description",
        content:
          "Cap table files founders have handed to Harmonious: assignment, preparation, questions for the founder and their approval before anything is recorded.",
      },
      { property: "og:title", content: "Migration Concierge — Harmonious Admin" },
      {
        property: "og:description",
        content: "Work every founder cap table migration from handover to recorded.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConciergeWorkspace,
});
