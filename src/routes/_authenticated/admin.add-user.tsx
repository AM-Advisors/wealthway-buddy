import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/add-user")({
  beforeLoad: () => {
    throw redirect({ to: "/ops/people-access", search: { tab: "access", sub: "invite" } });
  },
});
