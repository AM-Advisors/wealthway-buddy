import { createFileRoute } from "@tanstack/react-router";

import { PhasePlaceholder } from "@/components/captable/captable-states";

export const Route = createFileRoute("/_authenticated/client/cap-table/employees")({
  component: () => (
    <PhasePlaceholder
      title="Employee equity"
      description="Grants, vesting schedules, exercises and an employee portal where each person sees only their own equity."
      phase="Phase 2"
    />
  ),
});
