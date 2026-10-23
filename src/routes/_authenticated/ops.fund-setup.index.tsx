import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old Fund Setup list, funds now live on one Operations Funds page. */
export const Route = createFileRoute("/_authenticated/ops/fund-setup/")({
  beforeLoad: () => {
    throw redirect({ to: "/ops/funds", replace: true });
  },
});
