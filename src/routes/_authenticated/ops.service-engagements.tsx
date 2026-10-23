import { createFileRoute } from "@tanstack/react-router";
import { ServiceEngagementsAdmin } from "@/components/service-engagements-admin";

export const Route = createFileRoute("/_authenticated/ops/service-engagements")({
  head: () => ({
    meta: [
      { title: "Service engagements - Harmonious operations" },
      { name: "description", content: "Administration level, contracted pricing, team and entitlements for every fund." },
      { property: "og:title", content: "Service engagements - Harmonious operations" },
      { property: "og:description", content: "Administration level, contracted pricing, team and entitlements for every fund." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ServiceEngagementsAdmin,
});
