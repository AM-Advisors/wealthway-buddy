import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old cross-fund Readiness queue — investor work now lives on each fund's Investors tab, reached from the Funds list. */
export const Route = createFileRoute("/_authenticated/ops/readiness")({
  beforeLoad: () => {
    throw redirect({ to: "/ops/funds", replace: true });
  },
});
