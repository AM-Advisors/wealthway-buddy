import { createFileRoute } from "@tanstack/react-router";

import { PhasePlaceholder } from "@/components/captable/captable-states";

export const Route = createFileRoute("/_authenticated/client/cap-table/secondaries")({
  component: () => (
    <PhasePlaceholder
      title="Secondaries and transfer controls"
      description="Transfer requests, right of first refusal, board consent, SPV exposure verification and unauthorised activity cases."
      phase="Phase 4"
    />
  ),
});
