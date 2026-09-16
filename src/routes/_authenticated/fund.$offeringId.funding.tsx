import { createFileRoute } from "@tanstack/react-router";

import { FundingStep } from "@/components/steps/funding-step";

export const Route = createFileRoute("/_authenticated/fund/$offeringId/funding")({
  head: () => ({
    meta: [
      { title: "Fund Your Subscription — Harmonious" },
      {
        name: "description",
        content:
          "Fund your subscription in this fund by bank wire with a reference code, or authorize an ACH debit from your bank account.",
      },
      { property: "og:title", content: "Fund Your Subscription — Harmonious" },
      {
        property: "og:description",
        content: "Choose wire or ACH to complete your capital commitment in this fund.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FundFundingPage,
});

function FundFundingPage() {
  const { offeringId } = Route.useParams();
  return <FundingStep offeringId={offeringId} />;
}
