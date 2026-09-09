import { createFileRoute } from "@tanstack/react-router";

import { FundAccessRequests } from "@/components/fund-access-requests";

export const Route = createFileRoute("/_authenticated/admin/requests")({
  head: () => ({
    meta: [
      { title: "Access requests — Harmonious admin" },
      {
        name: "description",
        content: "Every request for fund materials sent from a public fund page.",
      },
      { property: "og:title", content: "Access requests — Harmonious admin" },
      {
        property: "og:description",
        content: "Review and follow up on public fund page access requests.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <FundAccessRequests backTo="/admin" />,
});
