import { createFileRoute } from "@tanstack/react-router";

import { HelpCenterHome, helpQuery } from "@/components/help/help-center";

export const Route = createFileRoute("/_authenticated/ops/help/")({
  head: () => ({
    meta: [
      { title: "Staff help center | Harmonious Operations" },
      { name: "description", content: "Procedures for Harmonious staff by role and service, plus the client help center." },
      { property: "og:title", content: "Staff help center | Harmonious Operations" },
      { property: "og:description", content: "Staff procedures and client help articles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(helpQuery("staff")),
  component: () => <HelpCenterHome ops />,
});
