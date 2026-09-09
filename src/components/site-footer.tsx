import { Link } from "@tanstack/react-router";

import { Logo } from "@/components/Logo";

/** Shared footer for the public harmonious.co pages. */
export function SiteFooter() {
  return (
    <footer className="border-t bg-primary text-primary-foreground">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo variant="white" className="h-7 w-auto" />
          <p className="mt-4 max-w-xs text-sm text-primary-foreground/70">
            Your funds on easy mode. Formation, administration and investor onboarding in one
            secure workspace.
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold">Platform</h2>
          <ul className="mt-4 space-y-2 text-sm text-primary-foreground/70">
            <li>
              <Link to="/platform" className="hover:text-primary-foreground">
                What's inside
              </Link>
            </li>
            <li>
              <Link to="/spv" className="hover:text-primary-foreground">
                Same-Day SPV
              </Link>
            </li>
            <li>
              <Link to="/fund-administration" className="hover:text-primary-foreground">
                Fund administration
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold">Company</h2>
          <ul className="mt-4 space-y-2 text-sm text-primary-foreground/70">
            <li>
              <Link to="/about" className="hover:text-primary-foreground">
                About Harmonious
              </Link>
            </li>
            <li>
              <Link to="/auth" className="hover:text-primary-foreground">
                Sign in
              </Link>
            </li>
            <li>
              <Link to="/auth/register" className="hover:text-primary-foreground">
                Create your account
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold">Important</h2>
          <p className="mt-4 text-sm text-primary-foreground/70">
            Nothing on this site is an offer to sell or a solicitation to buy securities. Private
            offerings are made only to qualified investors through the fund's own documents.
          </p>
        </div>
      </div>

      <div className="border-t border-primary-foreground/15">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-primary-foreground/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Harmonious Capital Administration.</p>
          <p>Harmonious is an administrator, not an investment adviser or broker-dealer.</p>
        </div>
      </div>
    </footer>
  );
}
