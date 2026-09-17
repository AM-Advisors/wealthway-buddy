import { createFileRoute } from "@tanstack/react-router";

import { NavBoard } from "@/components/nav-board";

export const Route = createFileRoute("/_authenticated/manager/nav")({
  head: () => ({
    meta: [
      { title: "Fund NAV — Harmonious" },
      {
        name: "description",
        content: "Net asset value for the funds you manage, with the movement and holdings behind it.",
      },
      { property: "og:title", content: "Fund NAV — Harmonious" },
      {
        property: "og:description",
        content: "Review, acknowledge or challenge the net asset value of your funds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <NavBoard role="manager" />,
});
