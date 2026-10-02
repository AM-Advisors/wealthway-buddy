import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/add-user")({
  beforeLoad: () => {
    throw redirect({ to: "/ops/access-control", search: { tab: "invite" } });
  },
});
