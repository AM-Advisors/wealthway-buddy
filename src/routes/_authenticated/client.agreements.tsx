import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/client/agreements")({
  head: () => ({
    meta: [
      { title: "Agreements & SOW — Harmonious" },
      {
        name: "description",
        content:
          "Review and execute your Harmonious master services agreement, request a new fund or SPV, and keep a permanent record of every executed statement of work.",
      },
      { property: "og:title", content: "Agreements & SOW — Harmonious" },
      {
        property: "og:description",
        content: "Master agreement, statements of work, pricing and signature history in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <Outlet />,
});
