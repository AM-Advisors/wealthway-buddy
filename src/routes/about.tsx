import { Link, createFileRoute } from "@tanstack/react-router";
import { marketingHead } from "@/lib/marketing/seo";

import { Button } from "@/components/ui/button";
import { LogoIcon } from "@/components/Logo";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const DESCRIPTION =
  "Harmonious Capital Administration is the administration, technology and onboarding partner behind private funds and SPVs — formation support, investor onboarding, reporting, payment facilitation and recordkeeping in one workspace.";

export const Route = createFileRoute("/about")({
  head: () =>
    marketingHead({
      path: "/about",
      title: "About Harmonious Capital Administration",
      description: DESCRIPTION,
      
      breadcrumbs: [{ name: "Home", path: "/" }, { name: "About", path: "/about" }],
      
    }),
  component: AboutPage,
});

const VALUES = [
  "Friendly",
  "Approachable",
  "Knowledgeable",
  "Educational",
  "Open",
  "Honest",
  "Trustworthy",
  "Respected",
  "Useful",
  "Easy",
] as const;

const WHAT_WE_DO: readonly [string, string][] = [
  [
    "Formation and administration support",
    "Entity set-up support, fund and SPV administration, capital account records, closings and the day-to-day operational work that keeps a vehicle in good order.",
  ],
  [
    "Investor onboarding",
    "Identity verification, anti-money-laundering screening, accreditation checks for 506(b) and 506(c), subscription documents and electronic signing — all tracked in one place.",
  ],
  [
    "Reporting and recordkeeping",
    "Capital account statements, distributions, valuations and a durable record of every document signed, every approval given and every dollar moved.",
  ],
  [
    "Payment facilitation",
    "Payment instructions recorded against verified beneficiaries, checked, approved by two authorised people, then matched back to invoices and investor deposits.",
  ],
  [
    "Compliance and regulatory support",
    "Filing calendars, document retention, holds where something needs to stop, and the evidence trail your counsel, auditor and regulators expect.",
  ],
  [
    "One workspace for everyone",
    "Sponsors, fund managers, investors, providers and our own team work from the same records, with access scoped to the role each person actually holds.",
  ],
];

function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main>
        <section className="bg-brand-gradient text-primary-foreground">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
            <LogoIcon variant="teal" className="h-12 w-auto" />
            <h1 className="mt-8 max-w-3xl text-4xl leading-[1.1] sm:text-5xl">
              The administration partner behind private funds.
            </h1>
            <p className="mt-6 max-w-3xl text-lg text-primary-foreground/75">
              Harmonious Capital Administration gives sponsors and fund managers a single, secure
              workspace for forming a vehicle, onboarding investors, moving money carefully and
              keeping records that stand up years later. Our mission is to use that platform to
              foster financial prosperity and harmony for our clients — built on trust, integrity
              and a steadfast commitment to ethical practice.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <h2 className="text-3xl leading-tight sm:text-4xl">What we do</h2>
          <p className="mt-4 max-w-3xl text-muted-foreground">
            Every engagement is governed by a Master Service Agreement together with one or more
            Statements of Work. The Statement of Work decides exactly which services apply, at what
            fees and on what timing — so what you see in the portal is always what you have agreed
            to, and anything outside it has to be requested, quoted and signed before it starts.
          </p>

          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {WHAT_WE_DO.map(([title, body]) => (
              <article key={title} className="rounded-xl border bg-card p-7">
                <h3 className="text-lg">{title}</h3>
                <p className="mt-3 text-sm text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t bg-secondary/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
            <h2 className="text-3xl leading-tight sm:text-4xl">What we are not</h2>
            <p className="mt-4 max-w-3xl text-muted-foreground">
              Being clear about this protects everyone. Harmonious is an administrative, technology,
              onboarding, reporting, payment-facilitation, recordkeeping, compliance-support and
              regulatory-support provider. We do not act as an investment adviser, broker-dealer,
              placement agent, custodian, transfer agent, escrow agent, trustee, general partner,
              fund manager, fiduciary, compliance officer, valuation agent, auditor, accountant, tax
              preparer or legal counsel, unless that role is expressly included in a specific signed
              Statement of Work.
            </p>

            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {[
                [
                  "Decisions stay with you",
                  "Investment decisions, valuations, distributions and filings belong to the client and its own advisers. We run the process and keep the record.",
                ],
                [
                  "Documents belong to you",
                  "Templates are a starting point for your counsel to tailor. Every version, signature and approval is retained.",
                ],
                [
                  "Privacy by default",
                  "Bank details, signed documents and investor files sit in restricted storage, reachable only by the people granted access.",
                ],
              ].map(([title, body]) => (
                <article key={title} className="rounded-xl border bg-card p-7">
                  <h3 className="text-lg">{title}</h3>
                  <p className="mt-3 text-sm text-muted-foreground">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <h2 className="text-3xl leading-tight sm:text-4xl">How we show up</h2>
          <ul className="mt-8 flex flex-wrap gap-3">
            {VALUES.map((v) => (
              <li
                key={v}
                className="rounded-full border border-accent/60 bg-accent/10 px-4 py-2 text-sm"
              >
                {v}
              </li>
            ))}
          </ul>

          <div className="mt-12 rounded-xl border bg-card p-7">
            <h3 className="text-lg">Harmonious Capital Administration LLC</h3>
            <p className="mt-3 text-sm text-muted-foreground">
              400 N Ervay Street, Dallas, Texas 75202, United States of America
              <br />
              <a className="underline underline-offset-4" href="mailto:support@harmonious.co">
                support@harmonious.co
              </a>
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Read our{" "}
              <Link to="/privacy" className="underline underline-offset-4">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link to="/terms" className="underline underline-offset-4">
                Terms of Service
              </Link>
              .
            </p>
          </div>
        </section>

        <section className="border-t bg-secondary/50">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-2xl">Work with us.</h2>
            <div className="flex gap-3">
              <Button asChild size="lg">
                <Link to="/contactus" search={{ cta: "schedule_demo", intent: "other" }}>Schedule a Demo</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth">Sign in</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
