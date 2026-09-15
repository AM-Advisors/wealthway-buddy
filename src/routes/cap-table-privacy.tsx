import { createFileRoute } from "@tanstack/react-router";

import { LegalDocumentPage } from "@/components/legal-document-page";
import { CAP_TABLE_PRIVACY } from "@/lib/legal-content";

const DESCRIPTION =
  "How Harmonious handles company, shareholder, share holding and certificate information recorded in the CapTable service, who can see it and how long it is kept.";

export const Route = createFileRoute("/cap-table-privacy")({
  head: () => ({
    meta: [
      { title: "CapTable Privacy Notice | Harmonious" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "CapTable Privacy Notice | Harmonious" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <LegalDocumentPage doc={CAP_TABLE_PRIVACY} />,
});
