import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getAdminAccess } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";


export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const access = useServerFn(getAdminAccess);
  const { data: adminAccess } = useQuery({ queryKey: ["admin-access"], queryFn: () => access() });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/" aria-label="Harmonious home">
            <Logo variant="navy" className="h-7 w-auto" />
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/dashboard">Status</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/portal">Portal</Link>
            </Button>
            {adminAccess?.isReviewer && (
              <Button asChild variant="ghost" size="sm">
                <Link to="/admin">{adminAccess.isAdmin ? "Admin" : "Funds"}</Link>
              </Button>
            )}

            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <Outlet />
    </div>
  );
}
