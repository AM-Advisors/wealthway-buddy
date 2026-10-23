import { createFileRoute, redirect } from "@tanstack/react-router";

// Retired: the old investor database kept its own copy of investor details.
// Investor details now live on the person and investment-profile records shown in Investor 360.
export const Route = createFileRoute("/_authenticated/admin/investors")({
  head: () => ({
    meta: [
      { title: "Investor directory - Harmonious operations" },
      { name: "description", content: "The investor directory now lives in Operations Investor 360." },
      { property: "og:title", content: "Investor directory - Harmonious operations" },
      { property: "og:description", content: "The investor directory now lives in Operations Investor 360." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/ops/investors", replace: true });
  },
});
