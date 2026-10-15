import { Fragment, useEffect } from "react";

import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, UserPlus } from "lucide-react";

import { Logo } from "@/components/Logo";
import { QuickJump } from "@/components/quick-jump";
import { Button } from "@/components/ui/button";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { breadcrumbsFor, parentPath } from "@/lib/breadcrumbs";
import { surfaceLabelForPath } from "@/lib/navigation";
import { getNavigation } from "@/lib/navigation";
import { useClientWorkspace } from "@/components/client-workspace";

/** Whether the top bar should carry the brand: only when no sidebar logo is visible. */
export function topbarShowsLogo(isMobile: boolean, openMobile: boolean): boolean {
  return isMobile && !openMobile;
}

/**
 * Contextual bar across the top of every signed-in page: menu toggle, Back,
 * a clickable trail to every parent page, and "Jump to" (Ctrl/Cmd+K).
 */
export function PortalTopbar(_props: { onSignOut: () => void }) {
  const { isMobile, openMobile } = useSidebar();
  const router = useRouter();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { session, activeId, applicationSurface } = useClientWorkspace();
  const { shell } = getNavigation(session as never, activeId, pathname, applicationSurface);
  const surfaceLabel = surfaceLabelForPath(pathname);
  const inOperations = shell === "ops";
  const crumbs = breadcrumbsFor(pathname);
  const parent = parentPath(pathname);

  useEffect(() => {
    if (typeof document === "undefined" || !inOperations) return;
    if (!document.title.startsWith("Harmonious Operations")) {
      document.title = `Harmonious Operations - ${document.title}`;
    }
  }, [inOperations, pathname]);

  const back = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else if (parent) router.navigate({ to: parent as never });
  };

  return (
    <header className={`sticky top-0 z-30 border-b backdrop-blur ${inOperations ? "bg-secondary" : "bg-background/95"}`}>
      <div className={`h-0.5 w-full ${inOperations ? "bg-primary" : "bg-accent"}`} aria-hidden />
      <div className="flex h-14 min-w-0 items-center gap-2 px-3">
        <SidebarTrigger />
        {topbarShowsLogo(isMobile, openMobile) && (
          <Link to={inOperations ? "/ops" : "/home"} aria-label="Harmonious home" data-testid="brand-logo" className="shrink-0">
            <span className="dark:hidden"><Logo variant="navy" className="h-6 w-auto" /></span>
            <span className="hidden dark:block"><Logo variant="white" className="h-6 w-auto" /></span>
          </Link>
        )}
        <span className={`shrink-0 text-xs font-semibold ${inOperations ? "text-primary" : "text-muted-foreground"}`}>{inOperations ? "Operations" : "Client portal"}</span>
        {parent && (
          <Button variant="ghost" size="sm" onClick={back} className="h-8 gap-1 px-2" aria-label="Go back">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
        )}
        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm md:flex">
          {inOperations && crumbs.length <= 1 && (
            <span className="truncate text-muted-foreground">Harmonious</span>
          )}
          {crumbs.length > 1 &&
            crumbs.map((c, i) => (
              <Fragment key={c.url}>
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                {i === crumbs.length - 1 ? (
                  <span className="truncate font-medium" aria-current="page">{c.label}</span>
                ) : (
                  <Link to={c.url as never} className="truncate text-muted-foreground hover:text-foreground">{c.label}</Link>
                )}
              </Fragment>
            ))}
          {!inOperations && crumbs.length <= 1 && <span className="truncate text-muted-foreground">{surfaceLabel}</span>}
        </nav>
        {inOperations && (
          <Button asChild variant="outline" size="sm" className="ml-auto h-8 gap-1 px-2">
            <Link to="/ops/people-access" search={{ tab: "access", sub: "invite" }} aria-label="Invite someone"><UserPlus className="h-4 w-4" /><span className="hidden sm:inline">Invite</span></Link>
          </Button>
        )}
        <QuickJump />
      </div>
    </header>
  );
}
