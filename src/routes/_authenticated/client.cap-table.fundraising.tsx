import { createFileRoute } from "@tanstack/react-router";

import { PhasePlaceholder } from "@/components/captable/captable-states";

export const Route = createFileRoute("/_authenticated/client/cap-table/fundraising")({
  component: () => (
    <PhasePlaceholder
      title="Fundraising"
      description="Rounds, SAFEs and notes, issuance workflows and scenario modelling before anything reaches the official record."
      phase="Phase 3"
    />
  ),
});
