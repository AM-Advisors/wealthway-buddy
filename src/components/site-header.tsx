import { useState } from "react";

import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const NAV = [
  { to: "/platform", label: "Platform" },
  { to: "/cap-table", label: "CapTable" },
  { to: "/spv", label: "Same-Day SPV" },
  { to: "/fund-administration", label: "Fund Administration" },
  { to: "/about", label: "About" },
] as const;

/** Shared navigation for the public harmonious.co pages. */
export function SiteHeader() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4">
        <Link to="/" aria-label="Harmonious home" className="shrink-0">
          <Logo variant="navy" className="h-7 w-auto" />
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-sm text-foreground font-medium" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {session ? (
            <Button asChild size="sm">
              <Link to="/portal">Go to your portal</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link to="/auth">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/auth/register">Get started</Link>
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-md border md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>

      {open && (
        <div className="border-t bg-background md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col px-4 py-2" aria-label="Main">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="border-b py-3 text-sm text-foreground last:border-0"
              >
                {item.label}
              </Link>
            ))}
            <div className="flex gap-2 py-4">
              {session ? (
                <Button asChild className="flex-1" onClick={() => setOpen(false)}>
                  <Link to="/portal">Go to your portal</Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="outline" className="flex-1">
                    <Link to="/auth" onClick={() => setOpen(false)}>
                      Sign in
                    </Link>
                  </Button>
                  <Button asChild className="flex-1">
                    <Link to="/auth/register" onClick={() => setOpen(false)}>
                      Get started
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
