import { createFileRoute } from "@tanstack/react-router";

import { HelpArticlePage, helpQuery } from "@/components/help/help-center";

export const Route = createFileRoute("/_authenticated/ops/help/$slug")({
  head: () => ({
    meta: [
      { title: "Help article - Harmonious Operations" },
      { name: "description", content: "A Harmonious staff help center article." },
      { property: "og:title", content: "Help article - Harmonious Operations" },
      { property: "og:description", content: "A Harmonious staff help center article." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(helpQuery("staff")),
  component: function OpsHelpArticleRoute() {
    const { slug } = Route.useParams();
    return <HelpArticlePage ops slug={slug} />;
  },
});
