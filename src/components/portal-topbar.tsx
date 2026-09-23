import { useEffect } from "react";

import { Link, useRouterState } from "@tanstack/react-router";

import { Logo } from "@/components/Logo";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { surfaceLabelForPath } from "@/lib/navigation";

/** Whether the top bar should carry the brand: only when no sidebar logo is visible. */
export function topbarShowsLogo(isMobile: boolean, openMobile: boolean): boolean {
  return isMobile && !openMobile;
}

/**
 * Contextual bar across the top of every signed-in page. The Harmonious logo
 * lives in the sidebar; the bar only shows it on mobile while the drawer is
 * closed, so exactly one logo is ever visible. Account controls live in the
 * sidebar footer.
 */
export function PortalTopbar(_props: { onSignOut: () => void }) {
  const { isMobile, openMobile } = useSidebar();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const surfaceLabel = surfaceLabelForPath(pathname);
  const inOperations = surfaceLabel === "Harmonious Operations";

  useEffect(() => {
    if (typeof document === "undefined" || !inOperations) return;
    if (!document.title.startsWith("Harmonious Operations")) {
      document.title = `Harmonious Operations — ${document.title}`;
    }
  }, [inOperations, pathname]);

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="h-0.5 w-full bg-accent" aria-hidden />
      <div className="flex h-14 min-w-0 items-center gap-3 px-3">
        <SidebarTrigger />
        {topbarShowsLogo(isMobile, openMobile) && (
          <Link to="/home" aria-label="Harmonious home" data-testid="brand-logo" className="shrink-0">
            <Logo variant="navy" className="h-6 w-auto" />
          </Link>
        )}
        {inOperations ? (
          <span className="truncate rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {surfaceLabel}
          </span>
        ) : (
          <span className="hidden truncate text-sm text-muted-foreground sm:inline">{surfaceLabel}</span>
        )}
      </div>
    </header>
  );
}
