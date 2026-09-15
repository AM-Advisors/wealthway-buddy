import { createFileRoute } from "@tanstack/react-router";

import { CapOnboardingGate } from "@/components/cap-onboarding-gate";
import { CapPolicyGate } from "@/components/cap-policy-gate";

import { FounderCapTable } from "@/components/founder-cap-table";
import { useClientPortal } from "@/components/client-portal-context";

export const Route = createFileRoute("/_authenticated/client/cap-table")({
  head: () => ({
    meta: [
      { title: "Cap Table — Harmonious Client Portal" },
      {
        name: "description",
        content:
          "Upload your shares, see who owns what and approve transfers on your company's cap table, kept on record by Harmonious.",
      },
      { property: "og:title", content: "Cap Table — Harmonious Client Portal" },
      {
        property: "og:description",
        content: "Stakeholders, shares, ownership percentages and transfer approvals in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientCapTablePage,
});

function ClientCapTablePage() {
  const { clientId } = useClientPortal();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Cap table</h2>
        <p className="text-sm text-muted-foreground">
          Your stakeholders, shares and ownership. Transfers move only once a signatory on your
          account approves them.
        </p>
      </div>
      <CapPolicyGate>
        <CapOnboardingGate clientId={clientId}>
          <FounderCapTable clientId={clientId} />
        </CapOnboardingGate>
      </CapPolicyGate>

    </div>
  );
}
