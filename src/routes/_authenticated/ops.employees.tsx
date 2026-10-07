import { createFileRoute, redirect } from "@tanstack/react-router";

// Combined into People & Access; kept so saved links keep working.
export const Route = createFileRoute("/_authenticated/ops/employees")({
  beforeLoad: () => { throw redirect({ to: "/ops/people-access", search: { tab: "employees" }, replace: true }); },
});
