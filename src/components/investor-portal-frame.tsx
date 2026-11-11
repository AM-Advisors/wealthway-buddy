import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

/** The investor portal's own header and footer, shared by the live portal and the fictional sandbox. */
export function InvestorPortalFrame({ onSignOut, children }: { onSignOut: () => void; children: React.ReactNode }) {
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
            <Button asChild variant="ghost" size="sm">
              <Link to="/investor/tax" activeProps={{ className: "bg-accent" }}>Tax</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={onSignOut}>Sign out</Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        Harmonious fund administration · Confidential to you
      </footer>
    </div>
  );
}
