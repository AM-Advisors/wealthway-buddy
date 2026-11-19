import { useEffect, useRef, useState } from "react";

import { Link } from "@tanstack/react-router";
import { ChevronDown, Menu, X } from "lucide-react";

import { Logo } from "@/components/Logo";
import { CtaLink } from "@/components/marketing/cta-link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { captureAttribution } from "@/lib/marketing/attribution";
import { headerNav, type NavGroup } from "@/lib/marketing/site-config";

/** Public marketing navigation: five short menus built from the central site config. */
export function SiteHeader() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const nav = headerNav();
  const portal = session ? { to: "/home" as const, label: "Go to your portal" } : { to: "/client-login" as const, label: "Log in" };

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
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link to="/" aria-label="Harmonious home" className="shrink-0">
          <span className="dark:hidden"><Logo variant="navy" className="h-7 w-auto" /></span>
          <span className="hidden dark:block"><Logo variant="white" className="h-7 w-auto" /></span>
        </Link>

        <nav ref={navRef} className="hidden flex-1 items-center justify-center gap-1 lg:flex" aria-label="Main">
          {nav.map((g) => (
            <DesktopGroup key={g.label} group={g} open={menu === g.label} onToggle={(v) => setMenu(v ? g.label : null)} />
          ))}
        </nav>

        <div className="ml-auto hidden shrink-0 items-center gap-2 lg:flex">
          <Button asChild size="sm" variant="ghost" className="whitespace-nowrap">
            <Link to={portal.to}>{portal.label}</Link>
          </Button>
          <CtaLink cta="schedule_demo" size="sm" className="whitespace-nowrap" />
        </div>

        <button
          type="button"
          className="ml-auto inline-flex size-10 items-center justify-center rounded-md text-foreground hover:bg-muted lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t bg-background lg:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col px-4 py-2 sm:px-6" aria-label="Main">
            {nav.map((g) =>
              g.items.length > 1 ? (
                <details key={g.label} className="group border-b">
                  <summary className="flex cursor-pointer list-none items-center justify-between py-3.5 text-base font-medium [&::-webkit-details-marker]:hidden">
                    {g.label}
                    <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <ul className="pb-3">
                    {g.items.map((i) => (
                      <li key={i.href}>
                        <Link to={i.href} onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 hover:bg-muted">
                          <span className="block text-sm font-medium text-foreground">{i.label}</span>
                          {i.description && <span className="block text-xs text-muted-foreground">{i.description}</span>}
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
                  className="border-b py-3.5 text-base font-medium"
                >
                  {g.label}
                </Link>
              ),
            )}
            <div className="flex flex-col gap-2 py-4">
              <CtaLink cta="schedule_demo" onClick={() => setOpen(false)} />
              <Button asChild variant="outline">
                <Link to={portal.to} onClick={() => setOpen(false)}>{portal.label}</Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function DesktopGroup({ group, open, onToggle }: { group: NavGroup; open: boolean; onToggle: (v: boolean) => void }) {
  const cls = "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
  if (group.items.length <= 1) {
    return (
      <Link to={group.href ?? group.items[0]!.href} className={cls} activeProps={{ className: `${cls} text-foreground` }}>
        {group.label}
      </Link>
    );
  }
  return (
    <div className="relative">
      <button
        type="button"
        className={`${cls} inline-flex items-center gap-1 ${open ? "bg-muted text-foreground" : ""}`}
        aria-expanded={open}
        onClick={() => onToggle(!open)}
      >
        {group.label}
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-50 mt-2 w-80 -translate-x-1/2 rounded-xl border bg-popover p-2 shadow-lg">
          {group.items.map((i) => (
            <Link key={i.href} to={i.href} onClick={() => onToggle(false)} className="block rounded-lg px-3 py-2.5 hover:bg-muted">
              <span className="block text-sm font-medium text-popover-foreground">{i.label}</span>
              {i.description && <span className="mt-0.5 block text-xs text-muted-foreground">{i.description}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
