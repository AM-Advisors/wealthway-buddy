import { Outlet, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { safeInternalPath } from "@/lib/app-origins";
import { AppSidebar } from "@/components/app-sidebar";
import { PolicyGate } from "@/components/policy-gate";
import { PortalGate } from "@/components/portal-gate";
import { PortalTopbar } from "@/components/portal-topbar";
import { PortalFooter } from "@/components/portal-footer";
import { SidebarProvider } from "@/components/ui/sidebar";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      // Remember where they were heading so the deep link survives signing in.
      const next = safeInternalPath(location.href, "");
      throw redirect({ to: "/auth", search: (next ? { next } : {}) as never });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar onSignOut={signOut} />
        <div className="flex min-w-0 flex-1 flex-col">
          <PortalTopbar onSignOut={signOut} />
          <main className="min-w-0 flex-1">
            <PolicyGate onSignOut={signOut}>
              <PortalGate onSignOut={signOut}>
                <Outlet />
              </PortalGate>
            </PolicyGate>
          </main>
          <PortalFooter />
        </div>
      </div>
    </SidebarProvider>
  );
}
