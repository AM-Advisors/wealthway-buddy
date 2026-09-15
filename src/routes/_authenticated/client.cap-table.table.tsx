import { createFileRoute } from "@tanstack/react-router";

import { CapTableView } from "@/components/captable/cap-table-view";

export const Route = createFileRoute("/_authenticated/client/cap-table/table")({
  component: () => <CapTableView />,
});
