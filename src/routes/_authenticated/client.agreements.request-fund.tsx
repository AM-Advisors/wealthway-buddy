import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Retired: new funds are requested once, through the shared Add Fund or SPV form,
 * so every answer lands in the fund's Setup. Old links open that form.
 */
export const Route = createFileRoute("/_authenticated/client/agreements/request-fund")({
  beforeLoad: () => {
    throw redirect({ to: "/client/funds/new", search: {} as any });
  },
});
