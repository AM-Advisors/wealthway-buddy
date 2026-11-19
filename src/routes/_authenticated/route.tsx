import { Link, Outlet, createFileRoute, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";

import { getPolicyStatus } from "@/lib/policies.functions";
import { getOwnProfileGap } from "@/lib/investor-start.functions";
import { resolveSession } from "@/lib/session.functions";
import { primeGateStage, type GateAuth } from "@/lib/mfa-stage";
import { AppShellLoading, PageLoading } from "@/components/page-loading";
import type { QueryClient } from "@tanstack/react-query";
import { accountKycStatusFn } from "@/lib/account-kyc.functions";
import { getPortalAccess } from "@/lib/portal-access.functions";
import { myEntitlementsFn } from "@/lib/saas-orders.functions";
import { requiredEntitlement } from "@/lib/saas-order-model";

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
import { logSecurityEvent } from "@/lib/account-security.functions";

export const Route = createFileRoute("/_authenticated")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  ssr: false,
  beforeLoad: async ({ location, context }) => {
    // The saved session answers instantly; the sign-in service confirms it once per visit.
    // Server functions check the token on every request, so this only decides what to draw.
    const { data: local } = await supabase.auth.getSession();
    const sessionUser = local.session?.user ?? null;
    if (!sessionUser) throw toSignIn(location.href);
    // Start every sign-in check now, alongside the page code, instead of one after another.
    primeSignedInChecks(context.queryClient, local.session?.access_token);
    if (confirmedUserId === sessionUser.id) return { user: sessionUser };
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw toSignIn(location.href);
    confirmedUserId = data.user.id;
    return { user: data.user };
  },
  // Drawn on the server, so the page outline shows at once while the app code arrives.
  pendingComponent: AppShellLoading,
  component: AuthenticatedLayout,
});

/** Signed-in account the sign-in service last confirmed in this tab; a different account is confirmed again. */
let confirmedUserId: string | null = null;

function toSignIn(href: string) {
  confirmedUserId = null;
  // Remember where they were heading so the deep link survives signing in.
  const next = safeInternalPath(href, "");
  return redirect({ to: "/auth", search: (next ? { next } : {}) as never });
}

/** Warms the same queries the gates read; each gate still decides from its own result. */
function primeSignedInChecks(queryClient: QueryClient, accessToken: string | undefined) {
  const fresh = { staleTime: 60_000 };
  void queryClient.prefetchQuery({ queryKey: ["policy-status"], queryFn: () => getPolicyStatus(), ...fresh });
  void queryClient.prefetchQuery({ queryKey: ["account-kyc-status"], queryFn: () => accountKycStatusFn(), ...fresh });
  void queryClient.prefetchQuery({ queryKey: ["portal-access"], queryFn: () => getPortalAccess(), ...fresh });
  void queryClient.prefetchQuery({ queryKey: ["client-session"], queryFn: () => resolveSession({ data: {} }), ...fresh });
  void queryClient.prefetchQuery({ queryKey: ["own-profile-gap"], queryFn: () => getOwnProfileGap(), staleTime: 5 * 60_000 });
  primeGateStage(supabase.auth as unknown as GateAuth, accessToken);
}

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await logSecurityEvent({ data: { eventType: "sign_out", action: "Explicit sign-out requested" } }).catch(() => {});
    await queryClient.cancelQueries();
    queryClient.clear();
    // Nothing about the last workspace, company or delegated context survives sign-out.
    clearStoredClientContext();
    confirmedUserId = null;
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
                <PlanAwarePortalGate onSignOut={signOut}>
                  <SecurityGate onSignOut={signOut}>
                    <OpsAreaGate>
                      <EntitlementGate>
                        <Outlet />
                      </EntitlementGate>
                    </OpsAreaGate>
                  </SecurityGate>
                </PlanAwarePortalGate>
                </AccountKycGate>
              </PolicyGate>
            </main>
            <PortalFooter />
          </div>
      </WorkspaceShell>
    </ClientWorkspaceProvider>
  );
}

/** Self-serve sign-up pages (/plan/*) open before any invitation exists; everything else keeps the invite gate. */
function PlanAwarePortalGate({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  if (pathname === "/plan" || pathname.startsWith("/plan/")) return <>{children}</>;
  return <PortalGate onSignOut={onSignOut}>{children}</PortalGate>;
}

/** Clients on purchased-services menus can't open pages they haven't bought (server checks still apply). */
function EntitlementGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const entFn = useServerFn(myEntitlementsFn);
  const need = requiredEntitlement(pathname);
  const ents = useQuery({ queryKey: ["my-entitlements"], queryFn: () => entFn(), staleTime: 60_000, enabled: !!need });
  if (!need || !ents.data || ents.data.includes(need)) return <>{children}</>;
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl">Not in your plan</h1>
      <p className="mt-3 text-sm text-muted-foreground">This area isn't part of the services you've purchased.</p>
      <Link to="/plan/start" className="mt-6 inline-block text-sm font-medium text-primary underline">Add to plan</Link>
    </div>
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
  if (loading) return <PageLoading />;
  const { shell } = getNavigation(session as never, activeId, pathname);
  if (shell === "ops") return <>{children}</>;
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl">Restricted</h1>
      <p className="mt-3 text-sm text-muted-foreground">This area is limited to Harmonious staff.</p>
    </div>
  );
}
