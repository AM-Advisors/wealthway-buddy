import { createFileRoute } from "@tanstack/react-router";

import { CapOnboardingGate } from "@/components/cap-onboarding-gate";
import { FounderCapTable } from "@/components/founder-cap-table";
import { SecuritiesView } from "@/components/captable/securities-view";
import { useClientPortal } from "@/components/client-portal-context";

export const Route = createFileRoute("/_authenticated/client/cap-table/securities")({
  component: SecuritiesPage,
});

function SecuritiesPage() {
  const { clientId } = useClientPortal();
  return (
    <div className="space-y-8">
      <SecuritiesView />
      <section className="space-y-3 border-t pt-6">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Shareholders and certificates</h3>
          <p className="text-sm text-muted-foreground">
            Upload holdings, invite shareholders, approve transfers and issue certificates.
          </p>
        </div>
        <CapOnboardingGate clientId={clientId}>
          <FounderCapTable clientId={clientId} />
        </CapOnboardingGate>
      </section>
    </div>
  );
}
