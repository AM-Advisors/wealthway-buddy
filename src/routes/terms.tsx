import { createFileRoute } from "@tanstack/react-router";

import { LegalDocumentPage } from "@/components/legal-document-page";
import { TERMS_OF_SERVICE } from "@/lib/legal-content";

const DESCRIPTION =
  "The terms governing use of the Harmonious portal: how services are scoped through the Master Service Agreement and each Statement of Work, fees and invoicing, money movement controls and the limits of our role.";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service | Harmonious" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Terms of Service | Harmonious" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <LegalDocumentPage doc={TERMS_OF_SERVICE} />,
});
