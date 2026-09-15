import { createFileRoute } from "@tanstack/react-router";

import { CapTableOverview } from "@/components/captable/overview-view";

export const Route = createFileRoute("/_authenticated/client/cap-table/")({
  component: () => <CapTableOverview />,
});
