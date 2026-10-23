import { createFileRoute } from "@tanstack/react-router";

import { HelpArticlePage, helpQuery } from "@/components/help/help-center";

export const Route = createFileRoute("/_authenticated/help/$slug")({
  head: () => ({
    meta: [
      { title: "Help article | Harmonious" },
      { name: "description", content: "A Harmonious help center article." },
      { property: "og:title", content: "Help article | Harmonious" },
      { property: "og:description", content: "A Harmonious help center article." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(helpQuery("client")),
  component: function HelpArticleRoute() {
    const { slug } = Route.useParams();
    return <HelpArticlePage ops={false} slug={slug} />;
  },
});
