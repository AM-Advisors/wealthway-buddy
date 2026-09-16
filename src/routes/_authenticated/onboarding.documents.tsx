import { createFileRoute, redirect } from "@tanstack/react-router";

import { getDocumentsStep } from "@/lib/documents.functions";

/**
 * Signing now lives under the fund the investor chose to invest in. This older
 * address still works and sends the person to the matching fund page.
 */
export const Route = createFileRoute("/_authenticated/onboarding/documents")({
  loader: async () => {
    const step = await getDocumentsStep({ data: {} });
    const offeringId = step.offering?.id;
    throw redirect(
      offeringId
        ? { to: "/fund/$offeringId/documents", params: { offeringId } }
        : { to: "/portal" },
    );
  },
  component: () => null,
});
