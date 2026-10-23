import { createFileRoute, redirect } from "@tanstack/react-router";

// Retired page: kept so saved links forward to the matching section of Reports.
export const Route = createFileRoute("/_authenticated/investor-performance")({
  head: () => ({
    meta: [
      { title: "Your performance | Harmonious" },
      { name: "description", content: "Your performance now live under Reports in the Harmonious portal." },
      { property: "og:title", content: "Your performance | Harmonious" },
      { property: "og:description", content: "Your performance now live under Reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/investor-reporting", search: { section: "performance" }, replace: true });
  },
});
