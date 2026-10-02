import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/messages")({
  beforeLoad: () => {
    throw redirect({ to: "/inbox", replace: true });
  },
});
