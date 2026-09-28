import { createFileRoute } from "@tanstack/react-router";

import { ComplianceCenter } from "@/components/compliance-center";

export const Route = createFileRoute("/_authenticated/ops/compliance")({
  head: () => ({
    meta: [
      { title: "Compliance & Controls — Harmonious Operations" },
      { name: "description", content: "Control library, evidence, access reviews, privacy, vendors, risks and incidents for Harmonious." },
      { property: "og:title", content: "Compliance & Controls — Harmonious Operations" },
      { property: "og:description", content: "How Harmonious controls are designed, operated and evidenced." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ComplianceCenter,
});
