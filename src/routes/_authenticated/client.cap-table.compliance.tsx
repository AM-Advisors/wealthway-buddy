import { createFileRoute } from "@tanstack/react-router";

import { ComplianceView } from "@/components/captable/compliance-view";

export const Route = createFileRoute("/_authenticated/client/cap-table/compliance")({
  head: () => ({
    meta: [
      { title: "Cap table compliance and audit history | Harmonious CapTable" },
      {
        name: "description",
        content:
          "Every ownership change, ledger entry and filed document in one immutable audit trail, filtered by company and stakeholder.",
      },
      { property: "og:title", content: "Cap table compliance and audit history" },
      {
        property: "og:description",
        content: "An immutable record of every cap table change, filterable by company and stakeholder.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComplianceView,
});
