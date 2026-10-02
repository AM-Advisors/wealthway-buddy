import { Link, Outlet, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { clearStoredClientContext } from "@/lib/client-context-storage";
import { PolicyGate } from "@/components/policy-gate";
import { Button } from "@/components/ui/button";

/**
 * The investor portal: its own sign-in and its own shell. It never renders the
 * client or Operations menus, workspace switcher or staff directory - only the
 * signed-in person's own investments. Every screen is still authorized on the
 * server against the person's own investor records.
 */
export const Route = createFileRoute("/investor")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/investor-login", search: { next: location.pathname } as never });
    }
    return { user: data.user };
  },
  component: InvestorLayout,
});

function InvestorLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    clearStoredClientContext();
    await supabase.auth.signOut();
    navigate({ to: "/investor-login", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/investor" className="font-heading text-lg font-semibold text-primary">
            Harmonious <span className="font-normal text-muted-foreground">Investor Portal</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/investor" activeOptions={{ exact: true }} activeProps={{ className: "bg-accent" }}>
                My investments
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <PolicyGate onSignOut={signOut}>
          <Outlet />
        </PolicyGate>
      </main>
      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        Harmonious fund administration · Confidential to you
      </footer>
    </div>
  );
}
