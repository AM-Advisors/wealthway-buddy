import { createFileRoute, redirect } from "@tanstack/react-router";

import { getFunding } from "@/lib/funding.functions";

/**
 * Funding now lives under the fund the investor chose to invest in. This older
 * address still works and sends the person to the matching fund page.
 */
export const Route = createFileRoute("/_authenticated/onboarding/funding")({
  loader: async () => {
    const funding = await getFunding({ data: {} });
    const offeringId = funding.offering?.id ?? funding.application?.offering_id;
    throw redirect(
      offeringId ? { to: "/fund/$offeringId/funding", params: { offeringId } } : { to: "/portal" },
    );
  },
  component: () => null,
});
