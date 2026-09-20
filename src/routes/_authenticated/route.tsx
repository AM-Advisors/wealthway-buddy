import { Outlet, createFileRoute, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { OpsSidebar } from "@/components/ops-sidebar";
import { getOperationsContext } from "@/lib/ops-access.functions";

import { supabase } from "@/integrations/supabase/client";
import { safeInternalPath } from "@/lib/app-origins";
import { clearStoredClientContext } from "@/lib/client-context-storage";
import { INTERNAL_PATH_PREFIXES } from "@/lib/client-navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { ClientSidebar } from "@/components/client-sidebar";
import { ClientWorkspaceProvider, useClientWorkspace } from "@/components/client-workspace";
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
    // Nothing about the last workspace, company or delegated context survives sign-out.
    clearStoredClientContext();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <ClientWorkspaceProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <Menu onSignOut={signOut} />
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
    </ClientWorkspaceProvider>
  );
}

/**
 * Client pages get the client menu, built from the workspace this person is
 * actually in. Harmonious-only sections keep the internal menu until the
 * operations console moves to its own address. Either way the backend, not the
 * menu, decides what anyone may open.
 */
function Menu({ onSignOut }: { onSignOut: () => void }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { options, activeKind } = useClientWorkspace();
  const loadOps = useServerFn(getOperationsContext);
  const { data: ops } = useQuery({
    queryKey: ["operations-context"],
    queryFn: () => loadOps({ data: {} }) as Promise<any>,
    staleTime: 60_000,
  });

  const onInternalPage = INTERNAL_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const hasClientWorkspace = options.some((option) => option.surface === "client");

  // Operations pages get the Operations menu, built from the permissions the
  // backend resolved for this staff member. Everything else is unchanged until
  // the remaining internal pages move across.
  const inOperations = pathname === "/ops" || pathname.startsWith("/ops/");
  if (inOperations && ops?.staff) {
    return <OpsSidebar onSignOut={onSignOut} />;
  }

  if (onInternalPage || !hasClientWorkspace || activeKind === "operations") {
    return <AppSidebar onSignOut={onSignOut} />;
  }
  return <ClientSidebar onSignOut={onSignOut} />;
}
