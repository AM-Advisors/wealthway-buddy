import { createFileRoute } from "@tanstack/react-router";

import { PhasePlaceholder } from "@/components/captable/captable-states";

export const Route = createFileRoute("/_authenticated/client/cap-table/reports")({
  component: () => (
    <PhasePlaceholder
      title="Reports"
      description="Ownership summaries, waterfall and dilution reports, exports for advisers, auditors and board packs."
      phase="Phase 6"
    />
  ),
});
