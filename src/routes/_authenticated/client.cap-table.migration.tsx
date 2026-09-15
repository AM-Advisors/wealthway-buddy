import { createFileRoute } from "@tanstack/react-router";

import { PhasePlaceholder } from "@/components/captable/captable-states";

export const Route = createFileRoute("/_authenticated/client/cap-table/migration")({
  component: () => (
    <PhasePlaceholder
      title="Cap table migration"
      description="Bring your history across from Carta, Pulley or your own files, with smart mapping, reconciliation and a concierge review before anything is accepted."
      phase="Phase 5"
    />
  ),
});
