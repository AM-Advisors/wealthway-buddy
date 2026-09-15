import { createFileRoute } from "@tanstack/react-router";

import { PhasePlaceholder } from "@/components/captable/captable-states";

export const Route = createFileRoute("/_authenticated/client/cap-table/investors")({
  component: () => (
    <PhasePlaceholder
      title="Investor management"
      description="Investor records, holdings, updates and an investor portal scoped to each investor's own position."
      phase="Phase 2"
    />
  ),
});
