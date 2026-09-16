import { createFileRoute } from "@tanstack/react-router";

import { MigrationView } from "@/components/captable/migration-view";

export const Route = createFileRoute("/_authenticated/client/cap-table/migration")({
  component: MigrationView,
});
