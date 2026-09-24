import { createFileRoute } from "@tanstack/react-router";

import { StakeholdersScreen } from "@/components/captable/company-360-screens";

export const Route = createFileRoute("/_authenticated/client/cap-table/stakeholders")({
  component: () => <StakeholdersScreen />,
});
