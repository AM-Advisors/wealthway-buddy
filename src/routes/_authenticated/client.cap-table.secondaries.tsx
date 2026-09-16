import { createFileRoute } from "@tanstack/react-router";

import { SecondariesView } from "@/components/captable/secondaries-view";

export const Route = createFileRoute("/_authenticated/client/cap-table/secondaries")({
  component: SecondariesView,
});
