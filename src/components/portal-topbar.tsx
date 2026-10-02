import { Fragment, useEffect } from "react";

import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { Logo } from "@/components/Logo";
import { QuickJump } from "@/components/quick-jump";
import { Button } from "@/components/ui/button";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { breadcrumbsFor, parentPath } from "@/lib/breadcrumbs";
import { surfaceLabelForPath } from "@/lib/navigation";

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
  const surfaceLabel = surfaceLabelForPath(pathname);
  const inOperations = surfaceLabel === "Harmonious Operations";
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
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="h-0.5 w-full bg-accent" aria-hidden />
      <div className="flex h-14 min-w-0 items-center gap-2 px-3">
        <SidebarTrigger />
        {topbarShowsLogo(isMobile, openMobile) && (
          <Link to="/home" aria-label="Harmonious home" data-testid="brand-logo" className="shrink-0">
            <Logo variant="navy" className="h-6 w-auto" />
          </Link>
        )}
        {parent && (
          <Button variant="ghost" size="sm" onClick={back} className="h-8 gap-1 px-2" aria-label="Go back">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
        )}
        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm md:flex">
          {inOperations && crumbs.length <= 1 && (
            <span className="truncate rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{surfaceLabel}</span>
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
        <QuickJump />
      </div>
    </header>
  );
}
