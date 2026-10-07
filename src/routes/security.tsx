import { createFileRoute } from "@tanstack/react-router";

import { SecurityCenterPage } from "@/components/security-center-page";
import { SECURITY_STATEMENT } from "@/lib/security-content";
import { seoLinks, seoMeta } from "@/lib/seo";

const TITLE = "Security & Privacy - Harmonious";
const DESCRIPTION =
  "How Harmonious protects funds, records and money: two-step sign-in, scoped access, locked records, and payment work that only people can release.";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
      ...seoMeta("/security"),
    ],
    links: seoLinks("/security"),
  }),
  component: () => <SecurityCenterPage />,
});
