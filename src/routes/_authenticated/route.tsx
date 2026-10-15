import { Outlet, createFileRoute, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, type ReactNode } from "react";

import { getPolicyStatus } from "@/lib/policies.functions";
import { accountKycStatusFn } from "@/lib/account-kyc.functions";
import { getPortalAccess } from "@/lib/portal-access.functions";

import { OpsSidebar } from "@/components/ops-sidebar";

import { supabase } from "@/integrations/supabase/client";
import { safeInternalPath } from "@/lib/app-origins";
import { clearStoredClientContext } from "@/lib/client-context-storage";
import { getNavigation } from "@/lib/navigation";
import { ClientSidebar } from "@/components/client-sidebar";
import { ClientWorkspaceProvider, useClientWorkspace } from "@/components/client-workspace";
import { PolicyGate } from "@/components/policy-gate";
import { AccountKycGate } from "@/components/account-kyc-gate";
import { PortalGate } from "@/components/portal-gate";
import { SecurityGate } from "@/components/security-gate";
import { PortalTopbar } from "@/components/portal-topbar";
import { PortalFooter } from "@/components/portal-footer";
import { SidebarProvider } from "@/components/ui/sidebar";
import { EditContextBanner } from "@/components/view-as";

export const Route = createFileRoute("/_authenticated")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
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
  const policyStatus = useServerFn(getPolicyStatus);
  const kycStatus = useServerFn(accountKycStatusFn);
  const portalAccess = useServerFn(getPortalAccess);

  // The gates below nest, so start all their checks at once instead of one after another.
  // Each gate still decides from its own query; this only warms the cache.
  useEffect(() => {
    void queryClient.prefetchQuery({ queryKey: ["policy-status"], queryFn: () => policyStatus(), staleTime: 60_000 });
    void queryClient.prefetchQuery({ queryKey: ["account-kyc-status"], queryFn: () => kycStatus(), staleTime: 60_000 });
    void queryClient.prefetchQuery({ queryKey: ["portal-access"], queryFn: () => portalAccess(), staleTime: 60_000 });
  }, [queryClient, policyStatus, kycStatus, portalAccess]);

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
      <WorkspaceShell>
          <Menu onSignOut={signOut} />
          <div className="flex min-w-0 flex-1 flex-col">
            <PortalTopbar onSignOut={signOut} />
            <EditContextBanner />
            <main className="min-w-0 flex-1">
              <PolicyGate onSignOut={signOut}>
                <AccountKycGate onSignOut={signOut}>
                <PortalGate onSignOut={signOut}>
                  <SecurityGate onSignOut={signOut}>
                    <OpsAreaGate>
                      <Outlet />
                    </OpsAreaGate>
                  </SecurityGate>
                </PortalGate>
                </AccountKycGate>
              </PolicyGate>
            </main>
            <PortalFooter />
          </div>
      </WorkspaceShell>
    </ClientWorkspaceProvider>
  );
}

function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { activeId, session, applicationSurface } = useClientWorkspace();
  const { shell } = getNavigation(session as never, activeId, pathname, applicationSurface);
  return <SidebarProvider className={`workspace-${shell}`} data-application={shell}>
    <div className="flex min-h-screen w-full bg-background">{children}</div>
  </SidebarProvider>;
}

/**
 * Client pages get the client menu, built from the workspace this person is
 * actually in. Harmonious-only sections keep the internal menu until the
 * operations console moves to its own address. Either way the backend, not the
 * menu, decides what anyone may open.
 */
function Menu({ onSignOut }: { onSignOut: () => void }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  // One canonical projection decides the shell. Hostname and pathname only
  // pick a layout; Operations still requires resolved staff facts.
  const { activeId, session, applicationSurface } = useClientWorkspace();
  const { shell } = getNavigation(session as never, activeId, pathname, applicationSurface);
  if (shell === "ops") return <OpsSidebar onSignOut={onSignOut} />;
  return <ClientSidebar onSignOut={onSignOut} />;
}

/**
 * Operations pages are Harmonious-only. Server functions already refuse
 * non-staff, but non-staff must not see the Operations page shell either.
 */
function OpsAreaGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { activeId, session, loading } = useClientWorkspace();
  if (!(pathname === "/ops" || pathname.startsWith("/ops/"))) return <>{children}</>;
  if (loading) return <div className="p-10 text-sm text-muted-foreground">Loading...</div>;
  const { shell } = getNavigation(session as never, activeId, pathname);
  if (shell === "ops") return <>{children}</>;
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl">Restricted</h1>
      <p className="mt-3 text-sm text-muted-foreground">This area is limited to Harmonious staff.</p>
    </div>
  );
}
