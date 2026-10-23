import { createFileRoute, redirect } from "@tanstack/react-router";

// Retired page: kept so saved links forward to the matching section of Reports.
export const Route = createFileRoute("/_authenticated/investor-distributions")({
  head: () => ({
    meta: [
      { title: "My distributions - Harmonious" },
      { name: "description", content: "My distributions now live under Reports in the Harmonious portal." },
      { property: "og:title", content: "My distributions - Harmonious" },
      { property: "og:description", content: "My distributions now live under Reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/investor-reporting", search: { section: "distributions" }, replace: true });
  },
});
