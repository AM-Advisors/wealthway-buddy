import { createFileRoute, redirect } from "@tanstack/react-router";

// Compliance & Controls now lives inside the Security & Compliance Center.
export const Route = createFileRoute("/_authenticated/ops/compliance")({
  beforeLoad: () => {
    throw redirect({ to: "/ops/security-compliance", search: { section: "overview" }, replace: true });
  },
});
