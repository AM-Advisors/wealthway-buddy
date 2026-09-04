import { createFileRoute } from "@tanstack/react-router";

import { ApplicationReview } from "@/components/application-review";

export const Route = createFileRoute("/_authenticated/admin/$applicationId")({
  head: () => ({
    meta: [
      { title: "Application Review — Harmonious Admin" },
      {
        name: "description",
        content:
          "Review one investor's KYC, AML, accreditation evidence, signed documents and funding, then approve, reject or email them.",
      },
      { property: "og:title", content: "Application Review — Harmonious Admin" },
      {
        property: "og:description",
        content: "Compliance detail view for a single investor application.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminDetail,
});

function AdminDetail() {
  const { applicationId } = Route.useParams();
  return <ApplicationReview applicationId={applicationId} backTo="/admin" backLabel="Review queue" />;
}
