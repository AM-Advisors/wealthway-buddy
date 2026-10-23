import { createFileRoute, redirect } from "@tanstack/react-router";

// Retired page: kept so saved links forward to the matching section of Reports.
export const Route = createFileRoute("/_authenticated/investor-financials")({
  head: () => ({
    meta: [
      { title: "Fund reports - Harmonious" },
      { name: "description", content: "Fund reports now live under Reports in the Harmonious portal." },
      { property: "og:title", content: "Fund reports - Harmonious" },
      { property: "og:description", content: "Fund reports now live under Reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/investor-reporting", search: { section: "financials" }, replace: true });
  },
});
