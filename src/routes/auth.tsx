import { Link, Outlet, createFileRoute } from "@tanstack/react-router";

import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/auth")({
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <main className="min-h-screen lg:grid lg:grid-cols-2">
      <aside className="paper-grid hidden flex-col justify-between bg-primary/5 px-10 py-12 lg:flex">
        <Link to="/" aria-label="Harmonious home">
          <Logo variant="navy" className="h-8 w-auto" />
        </Link>
        <div className="max-w-sm">
          <h2 className="text-3xl leading-tight">
            The private place for your fund investment.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Verify your identity, review the fund's documents, sign and fund — all in one
            confidential workspace. Your progress is saved as you go, so you can stop and return
            whenever it suits you.
          </p>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>Bank-grade encryption on every document</li>
          <li>Access limited to you and your fund's team</li>
          <li>Every action recorded for your records</li>
        </ul>
      </aside>

      <section className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <Link to="/" aria-label="Harmonious home" className="lg:hidden">
            <Logo variant="navy" className="mb-8 h-7 w-auto" />
          </Link>
          <Outlet />
        </div>
      </section>
    </main>
  );
}
