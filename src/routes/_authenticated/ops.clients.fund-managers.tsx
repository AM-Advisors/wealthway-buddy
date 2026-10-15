import { createFileRoute, redirect } from "@tanstack/react-router";

// Condensed into People & Access → Everyone else; old links still work.
export const Route = createFileRoute("/_authenticated/ops/clients/fund-managers")({
  beforeLoad: () => { throw redirect({ to: "/ops/people-access", search: { tab: "others", sub: "fund_managers" } }); },
});
