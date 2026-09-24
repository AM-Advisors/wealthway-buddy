import { createFileRoute } from "@tanstack/react-router";

import { TransactionsScreen } from "@/components/captable/company-360-screens";

export const Route = createFileRoute("/_authenticated/client/cap-table/transactions")({
  component: () => <TransactionsScreen />,
});
