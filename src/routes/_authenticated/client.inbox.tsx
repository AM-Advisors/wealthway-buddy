import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/client/inbox")({
  beforeLoad: () => {
    throw redirect({ to: "/inbox", replace: true });
  },
});
