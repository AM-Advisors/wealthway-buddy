import { useEffect } from "react";

import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LogOut, User } from "lucide-react";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getNavState } from "@/lib/nav.functions";

/** Branded bar across the top of every signed-in page. */
export function PortalTopbar({ onSignOut }: { onSignOut: () => void }) {
  const loadNav = useServerFn(getNavState);
  const { data: nav } = useQuery({
    queryKey: ["nav-state"],
    queryFn: () => loadNav(),
    staleTime: 60_000,
  });

  // Staff must never be in any doubt about which side of Harmonious they are
  // looking at, so the privileged surface says so in the bar and the tab title.
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const inOperations = pathname === "/ops" || pathname.startsWith("/ops/");
  const surfaceLabel = inOperations ? "Harmonious Operations" : "Client & investor portal";

  useEffect(() => {
    if (typeof document === "undefined" || !inOperations) return;
    if (!document.title.startsWith("Harmonious Operations")) {
      document.title = `Harmonious Operations — ${document.title}`;
    }
  }, [inOperations, pathname]);

  const name = (nav as any)?.profile?.legal_name as string | undefined;
  const email = (nav as any)?.profile?.email as string | undefined;
  const label = name || email || "Your account";
  const initial = (name || email || "H").trim().charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="h-0.5 w-full bg-accent" aria-hidden />
      <div className="flex h-14 items-center gap-3 px-3">
        <SidebarTrigger />
        <Link to="/home" aria-label="Harmonious home" className="shrink-0">
          <Logo variant="navy" className="h-6 w-auto" />
        </Link>

        {inOperations ? (
          <span className="ml-1 truncate rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {surfaceLabel}
          </span>
        ) : (
          <span className="ml-1 hidden truncate text-sm text-muted-foreground sm:inline">
            {surfaceLabel}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  {initial}
                </span>
                <span className="hidden max-w-40 truncate sm:inline">{label}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate">{label}</DropdownMenuLabel>
              {email && name ? (
                <p className="truncate px-2 pb-1 text-xs text-muted-foreground">{email}</p>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/sign-off" className="flex items-center gap-2">
                  <User className="size-4" /> Your sign-off
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onSignOut()} className="flex items-center gap-2">
                <LogOut className="size-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
