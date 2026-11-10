import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";

import { currentInvestmentForFund } from "@/lib/legacy-step-redirect.functions";

import { FundingStep } from "@/components/steps/funding-step";

export const Route = createFileRoute("/_authenticated/fund/$offeringId/funding")({
  head: () => ({
    meta: [
      { title: "Fund Your Subscription | Harmonious" },
      {
        name: "description",
        content:
          "Fund your subscription in this fund by bank wire with a reference code, or authorize an ACH debit from your bank account.",
      },
      { property: "og:title", content: "Fund Your Subscription | Harmonious" },
      {
        property: "og:description",
        content: "Choose wire or ACH to complete your capital commitment in this fund.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // A current investment record for this fund owns its status: open it instead.
  loader: async ({ params }) => {
    try {
      const { onboardingId } = await currentInvestmentForFund({ data: { offeringId: params.offeringId } });
      if (onboardingId) throw redirect({ to: "/investment/$onboardingId", params: { onboardingId }, search: { step: "fund" } });
    } catch (e) {
      if (isRedirect(e)) throw e;
    }
    return null;
  },
  component: FundFundingPage,
});

function FundFundingPage() {
  const { offeringId } = Route.useParams();
  return <FundingStep offeringId={offeringId} />;
}
