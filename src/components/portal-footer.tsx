import { Link } from "@tanstack/react-router";

import { LogoIcon } from "@/components/Logo";

/** Slim navy footer shown under every signed-in portal page. */
export function PortalFooter() {
  const linkClass = "text-primary-foreground/80 hover:text-primary-foreground";
  return (
    <footer className="mt-12 border-t border-primary/20 bg-primary text-primary-foreground">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 text-xs md:grid-cols-[1fr_auto] md:gap-12">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <LogoIcon variant="white" className="h-5 w-auto" />
            <span className="text-primary-foreground/80">
              © {new Date().getFullYear()} Harmonious
            </span>
          </div>
          <p className="max-w-md text-primary-foreground/70">
            Harmonious provides administration, technology, onboarding, reporting, payment
            facilitation and recordkeeping support. Harmonious is not an investment adviser,
            broker-dealer, custodian, auditor or legal counsel.
          </p>
        </div>

        <div className="space-y-3 md:text-right">
          <nav className="grid grid-cols-2 gap-x-6 gap-y-2 md:text-left">
            <Link to="/sign-off" className={linkClass}>
              Policies you've signed
            </Link>
            <Link to="/privacy" className={linkClass}>
              Privacy Policy
            </Link>
            <Link to="/terms" className={linkClass}>
              Terms of Service
            </Link>
            <Link to="/cap-table-privacy" className={linkClass}>
              CapTable Privacy
            </Link>
            <Link to="/cap-table-terms" className={linkClass}>
              CapTable Terms
            </Link>
            <Link to="/about" className={linkClass}>
              About
            </Link>
          </nav>
          <a href="mailto:support@harmonious.co" className={`block ${linkClass}`}>
            support@harmonious.co
          </a>
        </div>
      </div>
    </footer>
  );
}
