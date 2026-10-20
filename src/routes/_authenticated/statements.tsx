import { createFileRoute, redirect } from "@tanstack/react-router";

// Retired page: kept so saved links forward to the matching section of Reports.
export const Route = createFileRoute("/_authenticated/statements")({
  head: () => ({
    meta: [
      { title: "Capital account statements - Harmonious" },
      { name: "description", content: "Capital account statements now live under Reports in the Harmonious portal." },
      { property: "og:title", content: "Capital account statements - Harmonious" },
      { property: "og:description", content: "Capital account statements now live under Reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/investor-reporting", search: { section: "statements" }, replace: true });
  },
});
