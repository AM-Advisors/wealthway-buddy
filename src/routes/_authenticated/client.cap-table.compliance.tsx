import { createFileRoute } from "@tanstack/react-router";

import { PhasePlaceholder } from "@/components/captable/captable-states";

export const Route = createFileRoute("/_authenticated/client/cap-table/compliance")({
  component: () => (
    <PhasePlaceholder
      title="Compliance and audit"
      description="Ownership chain, verification status, filings support and the full audit history behind every change."
      phase="Phase 6"
    />
  ),
});
