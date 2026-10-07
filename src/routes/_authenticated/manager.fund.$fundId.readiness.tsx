import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old Readiness URL — readiness now lives on the fund's Investors tab. */
export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/readiness")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/manager/fund/$fundId/investors", params: { fundId: params.fundId }, replace: true });
  },
});
