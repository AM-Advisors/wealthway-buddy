import { createFileRoute } from "@tanstack/react-router";

import { FundraisingView } from "@/components/captable/fundraising-view";

export const Route = createFileRoute("/_authenticated/client/cap-table/fundraising")({
  component: FundraisingView,
});
