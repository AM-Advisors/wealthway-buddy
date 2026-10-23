import { createFileRoute } from "@tanstack/react-router";

import { HelpCenterHome, helpQuery } from "@/components/help/help-center";

export const Route = createFileRoute("/_authenticated/help/")({
  head: () => ({
    meta: [
      { title: "Help center - Harmonious" },
      { name: "description", content: "Guides for investors, fund managers and companies using Harmonious." },
      { property: "og:title", content: "Help center - Harmonious" },
      { property: "og:description", content: "Guides by role and by service." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(helpQuery("client")),
  component: () => <HelpCenterHome ops={false} />,
});
