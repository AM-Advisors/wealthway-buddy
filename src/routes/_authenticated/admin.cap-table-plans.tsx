import { createFileRoute } from "@tanstack/react-router";

import { CapTablePlanUsage } from "@/components/cap-table-plan-usage";

export const Route = createFileRoute("/_authenticated/admin/cap-table-plans")({
  head: () => ({
    meta: [
      { title: "Cap Table Plans — Harmonious Admin" },
      {
        name: "description",
        content:
          "Track each client's cap table plan: stakeholders used against their allowance, holdings, shares outstanding and transfers awaiting approval.",
      },
      { property: "og:title", content: "Cap Table Plans — Harmonious Admin" },
      {
        property: "og:description",
        content: "Plan usage, allowances and pending transfers for every cap table client.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CapTablePlanUsage,
});
