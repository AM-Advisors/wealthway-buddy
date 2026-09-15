import { createFileRoute } from "@tanstack/react-router";

import { PhasePlaceholder } from "@/components/captable/captable-states";

export const Route = createFileRoute("/_authenticated/client/cap-table/documents")({
  component: () => (
    <PhasePlaceholder
      title="Document vault"
      description="Signed agreements, board consents and certificates, each matched to the position it evidences."
      phase="Phase 6"
    />
  ),
});
