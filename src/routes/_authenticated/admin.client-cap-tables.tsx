import { createFileRoute } from "@tanstack/react-router";

import { StaffCapTable } from "@/components/staff-cap-table";

export const Route = createFileRoute("/_authenticated/admin/client-cap-tables")({
  head: () => ({
    meta: [
      { title: "Client Cap Tables — Harmonious Admin" },
      {
        name: "description",
        content:
          "Every cap table client's shareholders, share records, certificates and transfers, with certificate issue and cancellation on the company's instruction.",
      },
      { property: "og:title", content: "Client Cap Tables — Harmonious Admin" },
      {
        property: "og:description",
        content: "Shares, certificates and transfers for every Harmonious cap table client.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StaffCapTable,
});
