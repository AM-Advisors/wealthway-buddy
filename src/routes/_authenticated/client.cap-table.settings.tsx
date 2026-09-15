import { createFileRoute } from "@tanstack/react-router";

import { CapTableSettings } from "@/components/captable/settings-view";

export const Route = createFileRoute("/_authenticated/client/cap-table/settings")({
  component: () => <CapTableSettings />,
});
