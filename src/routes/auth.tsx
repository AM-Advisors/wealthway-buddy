import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AuthShell } from "@/components/auth-shell";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <AuthShell>
      <Outlet />
    </AuthShell>
  );
}
