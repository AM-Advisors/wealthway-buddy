import { createFileRoute } from "@tanstack/react-router";

import { FundPayments } from "@/components/fund-payments";

export const Route = createFileRoute("/_authenticated/admin/fund-payments/$fundId")({
  head: () => ({
    meta: [
      { title: "Fund payments — Harmonious admin" },
      {
        name: "description",
        content:
          "Invoice a fund's wire fees and closing costs, record the payments and follow the full audit trail.",
      },
      { property: "og:title", content: "Fund payments — Harmonious admin" },
      {
        property: "og:description",
        content: "Wire fees and closing costs from earned to invoiced to paid, for one fund.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <FundPayments fundId={Route.useParams().fundId} backTo="admin" />,
});
