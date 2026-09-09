import { createFileRoute } from "@tanstack/react-router";

import { FundAccessRequests } from "@/components/fund-access-requests";

export const Route = createFileRoute("/_authenticated/manager/requests")({
  head: () => ({
    meta: [
      { title: "Access requests — Harmonious" },
      {
        name: "description",
        content: "Investors who asked for access from your public fund pages.",
      },
      { property: "og:title", content: "Access requests — Harmonious" },
      {
        property: "og:description",
        content: "Follow up with investors who requested the full fund materials.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <FundAccessRequests backTo="/manager" />,
});
