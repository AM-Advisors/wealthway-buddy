import { createFileRoute } from "@tanstack/react-router";

import { DocumentsStep } from "@/components/steps/documents-step";

export const Route = createFileRoute("/_authenticated/fund/$offeringId/documents")({
  head: () => ({
    meta: [
      { title: "Sign Your Fund Documents — Harmonious" },
      {
        name: "description",
        content:
          "Review the private placement memorandum, operating agreement and subscription agreement for this fund, then sign electronically with a full audit trail.",
      },
      { property: "og:title", content: "Sign Your Fund Documents — Harmonious" },
      {
        property: "og:description",
        content: "Review and e-sign the documents for the fund you are investing in.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FundDocumentsPage,
});

function FundDocumentsPage() {
  const { offeringId } = Route.useParams();
  return <DocumentsStep offeringId={offeringId} />;
}
