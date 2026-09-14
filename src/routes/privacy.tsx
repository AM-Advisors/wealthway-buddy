import { createFileRoute } from "@tanstack/react-router";

import { LegalDocumentPage } from "@/components/legal-document-page";
import { PRIVACY_POLICY } from "@/lib/legal-content";

const DESCRIPTION =
  "How Harmonious Capital Administration collects, uses, shares and protects personal information across our websites, portal and fund administration services.";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | Harmonious" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Privacy Policy | Harmonious" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <LegalDocumentPage doc={PRIVACY_POLICY} />,
});
