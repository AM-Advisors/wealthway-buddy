import { createFileRoute } from "@tanstack/react-router";

import { HolderDesk } from "@/components/captable/holder-desk";

export const Route = createFileRoute("/_authenticated/client/cap-table/investors")({
  component: () => <HolderDesk audience="investor" />,
});
