import { Link } from "@tanstack/react-router";

import { Logo } from "@/components/Logo";
import { DisclosureText } from "@/components/marketing/marketing-blocks";
import { CTAS, CTA_DESTINATION, ORGANIZATION, visibleNav } from "@/lib/marketing/site-config";

const LEGAL = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/cap-table-privacy", label: "CapTable Privacy Notice" },
  { href: "/cap-table-terms", label: "CapTable Terms of Service" },
];

/** Shared footer for public marketing pages. Columns come from the site config. */
export function SiteFooter() {
  const groups = visibleNav().filter((g) => g.items.length > 0);
  return (
    <footer className="border-t bg-primary text-primary-foreground">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <Logo variant="white" className="h-7 w-auto" />
          <p className="mt-4 max-w-xs text-sm text-primary-foreground/70">
            Fund and SPV administration, investor onboarding and cap table management in one place.
          </p>
          <div className="mt-5 flex flex-col gap-2 text-sm">
            <Link to={CTA_DESTINATION} search={{ cta: "schedule_demo", intent: CTAS.schedule_demo.intent }} className="font-medium underline-offset-4 hover:underline">
              Schedule a Demo
            </Link>
            <Link to="/client-login" className="text-primary-foreground/70 hover:text-primary-foreground">Client Login</Link>
            <a href={`mailto:${ORGANIZATION.email}`} className="text-primary-foreground/70 hover:text-primary-foreground">{ORGANIZATION.email}</a>
          </div>
        </div>

        {groups.map((g) => (
          <div key={g.label}>
            <h2 className="text-sm font-semibold">{g.label}</h2>
            <ul className="mt-4 space-y-2 text-sm text-primary-foreground/70">
              {g.items.map((i) => (
                <li key={i.href}>
                  <Link to={i.href} className="hover:text-primary-foreground">{i.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <h2 className="text-sm font-semibold">Legal</h2>
          <ul className="mt-4 space-y-2 text-sm text-primary-foreground/70">
            {LEGAL.map((l) => (
              <li key={l.href}>
                <Link to={l.href} className="hover:text-primary-foreground">{l.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-primary-foreground/15">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-primary-foreground/60">
          <DisclosureText className="space-y-1" />
          <p>© {new Date().getFullYear()} {ORGANIZATION.legalName}.</p>
        </div>
      </div>
    </footer>
  );
}
