import { createFileRoute } from "@tanstack/react-router";

import { ApplicationReview } from "@/components/application-review";

export const Route = createFileRoute("/_authenticated/manager/$applicationId")({
  head: () => ({
    meta: [
      { title: "Investor Review — Harmonious Fund Manager" },
      {
        name: "description",
        content:
          "Fund manager view of one investor: identity and screening results, accreditation evidence, signed fund documents and funding status.",
      },
      { property: "og:title", content: "Investor Review — Harmonious Fund Manager" },
      {
        property: "og:description",
        content: "Detail view for a single investor in your fund.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagerDetail,
});

function ManagerDetail() {
  const { applicationId } = Route.useParams();
  return <ApplicationReview applicationId={applicationId} backTo="/manager" backLabel="Fund overview" />;
}
