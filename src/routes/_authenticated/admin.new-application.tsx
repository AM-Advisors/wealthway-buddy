import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Retired: this page opened old-style applications outside a fund's investor
 * records. Investors are now added from a fund's Investors tab ("Add investor"),
 * which creates the fund's investment record directly.
 */
export const Route = createFileRoute("/_authenticated/admin/new-application")({
  beforeLoad: () => {
    throw redirect({ to: "/ops/funds", replace: true });
  },
});
