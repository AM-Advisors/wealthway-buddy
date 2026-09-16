import { createFileRoute } from "@tanstack/react-router";

import { ReconciliationView } from "@/components/captable/reconciliation-view";

export const Route = createFileRoute("/_authenticated/client/cap-table/reconciliation")({
  component: ReconciliationView,
});
