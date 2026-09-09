import { createFileRoute } from "@tanstack/react-router";

import { OperationsSs4 } from "@/components/operations-board";

export const Route = createFileRoute("/_authenticated/ops/ss4")({
  head: () => ({
    meta: [
      { title: "EIN and Form SS-4 — Harmonious operations" },
      {
        name: "description",
        content: "Check each fund's tax ID and generated Form SS-4 before the fund team relies on it.",
      },
      { property: "og:title", content: "EIN and Form SS-4 — Harmonious operations" },
      {
        property: "og:description",
        content: "Approve fund tax IDs and the IRS Form SS-4 generated for each entity.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <OperationsSs4 />,
});
