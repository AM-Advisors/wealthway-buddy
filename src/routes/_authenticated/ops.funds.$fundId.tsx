import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old fund board URL - every fund now has one page (Formation & EIN tab). */
export const Route = createFileRoute("/_authenticated/ops/funds/$fundId")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/ops/fund/$fundId", params: { fundId: params.fundId }, search: { tab: "formation" }, replace: true });
  },
});
