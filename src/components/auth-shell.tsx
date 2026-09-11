import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Logo } from "@/components/Logo";

/** Shared brand frame for the sign-in, registration and reset screens, so the
 *  journey into the portal looks like one Harmonious product. */
export function AuthShell({
  children,
  heading = "The private place for your fund.",
  blurb = "Verify your identity, review the documents, sign and fund — all in one confidential workspace. Your progress is saved as you go.",
  points = [
    "Bank-grade encryption on every document",
    "Access limited to you and your fund's team",
    "Every action recorded for your records",
  ],
}: {
  children: ReactNode;
  heading?: string;
  blurb?: string;
  points?: string[];
}) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-brand-gradient px-10 py-12 text-primary-foreground lg:flex">
        <Link to="/" aria-label="Harmonious home">
          <Logo variant="white" className="h-8 w-auto" />
        </Link>
        <div className="max-w-sm">
          <h2 className="text-3xl leading-tight text-primary-foreground">{heading}</h2>
          <p className="mt-4 text-primary-foreground/75">{blurb}</p>
        </div>
        <ul className="space-y-2 text-sm text-primary-foreground/70">
          {points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </aside>

      <div className="flex min-h-screen flex-col">
        <section className="flex flex-1 items-center justify-center px-4 py-12">
          <div className="w-full max-w-md">
            <Link to="/" aria-label="Harmonious home" className="lg:hidden">
              <Logo variant="navy" className="mb-8 h-7 w-auto" />
            </Link>
            {children}
          </div>
        </section>

        <footer className="border-t px-4 py-5 text-xs text-muted-foreground">
          <p className="mx-auto max-w-md">
            © {new Date().getFullYear()} Harmonious. Administration, technology, onboarding,
            reporting, payment facilitation and recordkeeping support — not an investment adviser,
            broker-dealer, custodian or legal counsel.
          </p>
        </footer>
      </div>
    </div>
  );
}
