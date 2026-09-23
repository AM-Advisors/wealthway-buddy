import { useEffect, useRef, useState } from "react";

import { Link } from "@tanstack/react-router";
import { ChevronDown, Menu, X } from "lucide-react";

import { Logo } from "@/components/Logo";
import { CtaLink } from "@/components/marketing/cta-link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { captureAttribution } from "@/lib/marketing/attribution";
import { visibleNav, type NavGroup } from "@/lib/marketing/site-config";

/** Public marketing navigation. Items come from the central site config. */
export function SiteHeader() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const nav = visibleNav();

  useEffect(() => {
    captureAttribution();
    const close = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setMenu(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
        <Link to="/" aria-label="Harmonious home" className="shrink-0">
          <Logo variant="navy" className="h-7 w-auto" />
        </Link>

        <nav ref={navRef} className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {nav.map((g) => (
            <DesktopGroup key={g.label} group={g} open={menu === g.label} onToggle={(v) => setMenu(v ? g.label : null)} />
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          {session ? (
            <Button asChild size="sm" variant="ghost">
              <Link to="/portal">Go to your portal</Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="ghost">
              <Link to="/client-login">Client Login</Link>
            </Button>
          )}
          <CtaLink cta="schedule_demo" size="sm" />
        </div>

        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-md border lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>

      {open && (
        <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t bg-background lg:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col px-4 py-2" aria-label="Main">
            {nav.map((g) =>
              g.items.length > 1 ? (
                <details key={g.label} className="border-b py-1">
                  <summary className="cursor-pointer list-none py-2.5 text-sm font-medium">{g.label}</summary>
                  <ul className="pb-2 pl-3">
                    {g.items.map((i) => (
                      <li key={i.href}>
                        <Link to={i.href} onClick={() => setOpen(false)} className="block py-2 text-sm text-muted-foreground">
                          {i.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                <Link
                  key={g.label}
                  to={g.href ?? g.items[0]!.href}
                  onClick={() => setOpen(false)}
                  className="border-b py-3.5 text-sm font-medium"
                >
                  {g.label}
                </Link>
              ),
            )}
            <div className="flex flex-col gap-2 py-4">
              <CtaLink cta="schedule_demo" onClick={() => setOpen(false)} />
              <Button asChild variant="outline">
                <Link to={session ? "/portal" : "/client-login"} onClick={() => setOpen(false)}>
                  {session ? "Go to your portal" : "Client Login"}
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function DesktopGroup({ group, open, onToggle }: { group: NavGroup; open: boolean; onToggle: (v: boolean) => void }) {
  const cls = "rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground";
  if (group.items.length <= 1) {
    return (
      <Link to={group.href ?? group.items[0]!.href} className={cls} activeProps={{ className: `${cls} text-foreground font-medium` }}>
        {group.label}
      </Link>
    );
  }
  return (
    <div className="relative">
      <button type="button" className={`${cls} inline-flex items-center gap-1`} aria-expanded={open} onClick={() => onToggle(!open)}>
        {group.label}
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border bg-popover p-2 shadow-lg">
          {group.items.map((i) => (
            <Link key={i.href} to={i.href} onClick={() => onToggle(false)} className="block rounded-md px-3 py-2 text-sm hover:bg-accent/10">
              {i.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
