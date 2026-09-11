import { Link } from "@tanstack/react-router";

import { LogoIcon } from "@/components/Logo";

/** Slim navy footer shown under every signed-in portal page. */
export function PortalFooter() {
  return (
    <footer className="mt-12 border-t border-primary/20 bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <LogoIcon variant="white" className="h-5 w-auto" />
          <span className="text-primary-foreground/80">
            © {new Date().getFullYear()} Harmonious
          </span>
        </div>

        <p className="max-w-xl text-primary-foreground/70">
          Harmonious provides administration, technology, onboarding, reporting, payment
          facilitation and recordkeeping support. Harmonious is not an investment adviser,
          broker-dealer, custodian, auditor or legal counsel.
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <Link to="/sign-off" className="hover:text-primary-foreground text-primary-foreground/80">
            Policies you've signed
          </Link>
          <a
            href="mailto:support@harmonious.co"
            className="hover:text-primary-foreground text-primary-foreground/80"
          >
            support@harmonious.co
          </a>
        </div>
      </div>
    </footer>
  );
}
