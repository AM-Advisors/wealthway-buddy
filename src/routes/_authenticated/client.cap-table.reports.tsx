import { createFileRoute } from "@tanstack/react-router";

import { ReportsScreen } from "@/components/captable/company-360-screens";

export const Route = createFileRoute("/_authenticated/client/cap-table/reports")({
  component: () => <ReportsScreen />,
});
