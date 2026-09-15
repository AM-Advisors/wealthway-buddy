import { createFileRoute } from "@tanstack/react-router";

import { LegalDocumentPage } from "@/components/legal-document-page";
import { CAP_TABLE_TERMS } from "@/lib/legal-content";

const DESCRIPTION =
  "The terms for using the Harmonious CapTable service: what the records do and do not represent, founder responsibilities, certificates, transfers, shareholder access, plans and fees.";

export const Route = createFileRoute("/cap-table-terms")({
  head: () => ({
    meta: [
      { title: "CapTable Terms of Service | Harmonious" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "CapTable Terms of Service | Harmonious" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <LegalDocumentPage doc={CAP_TABLE_TERMS} />,
});
