import { createFileRoute, Link } from "@tanstack/react-router";
import { marketingHead } from "@/lib/marketing/seo";

import heroImage from "@/assets/platform-funding.png";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () =>
    marketingHead({
      path: "/",
      title: "Fund Administration, SPVs & Cap Table Management | Harmonious",
      description: "Harmonious provides fund and SPV administration, investor onboarding, cap table management, fund accounting, reporting and private-market infrastructure for fund managers and founders.",
      image: "https://onboard.harmonious.co/og-harmonious.jpg",
      
      
    }),
  component: Index,
});

const PILLARS = [
  {
    title: "Form The Entity",
    body: "Streamlined SPV and fund entity formation, with the operating agreement, subscription documents and offering memorandum prepared alongside it.",
    to: "/spvs",
    cta: "SPV Administration",
  },
  {
    title: "Onboard The Investors",
    body: "Identity verification, AML screening, accreditation under Rule 506(b) or 506(c), document e-signature and investor funding workflows — in one guided flow.",
    to: "/platform",
    cta: "See the platform",
  },
  {
    title: "Administer The Fund",
    body: "Cap table, capital calls, closings, distributions and investor reporting, kept current as commitments and wires land.",
    to: "/fund-administration",
    cta: "Fund administration",
  },
] as const;

const STEPS = [
  ["01", "Identity", "Legal name, address, tax ID and government identification, verified."],
  ["02", "Screening", "Source of funds and wealth, PEP and sanctions declarations."],
  ["03", "Accreditation", "506(b) self-certification or 506(c) third-party evidence."],
  ["04", "Documents", "Review the offering materials and sign them in the browser."],
  ["05", "Funding", "Investors fund against the fund's own instructions; receipt is matched and reconciled."],
  ["06", "Ownership", "Shares, ownership percentage and portfolio value, live in the portal."],
] as const;

function Index() {
  const { session } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main>
        {/* Hero */}
        <section className="bg-brand-gradient text-primary-foreground">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 lg:grid-cols-2 lg:py-28">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-accent">
                Harmonious Capital Administration
              </p>
              <h1 className="mt-6 text-4xl leading-[1.1] sm:text-5xl lg:text-6xl">
                Your Funds On Easy Mode
              </h1>
              <p className="mt-6 max-w-lg text-lg text-primary-foreground/75">
                Move at the speed of the deal. We form the entity, run compliant investor
                onboarding and administer the fund, so the difference between closing an
                opportunity and missing it is never paperwork.
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                <Button asChild size="lg" variant="secondary">
                  <Link to={session ? "/portal" : "/auth/register"}>
                    {session ? "Go to your portal" : "Start your fund"}
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                >
                  <Link to="/platform">See how it works</Link>
                </Button>
              </div>
              <ul className="mt-10 flex flex-wrap gap-x-8 gap-y-2 text-sm text-primary-foreground/70">
                <li>Rapid entity formation</li>
                <li>Streamlined onboarding &amp; compliance</li>
                <li>Investor-ready from day one</li>
              </ul>
            </div>

            <img
              src={heroImage}
              alt="The Harmonious funding dashboard showing capital raised and progress across funds"
              width={1600}
              height={1008}
              className="w-full rounded-2xl border border-primary-foreground/15 shadow-2xl"
            />
          </div>
        </section>

        {/* Pillars */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="max-w-2xl text-3xl leading-tight sm:text-4xl">
            One Platform From Formation To Final Close
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Sponsors, fund managers and their investors work in the same place, on the same
            record, with every action timestamped.
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {PILLARS.map((p) => (
              <article
                key={p.title}
                className="flex flex-col rounded-xl border bg-card p-7 transition-shadow hover:shadow-lg"
              >
                <h3 className="text-xl">{p.title}</h3>
                <p className="mt-3 flex-1 text-sm text-muted-foreground">{p.body}</p>
                <Link
                  to={p.to}
                  className="mt-6 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {p.cta} →
                </Link>
              </article>
            ))}
          </div>
        </section>

        {/* CapTable */}
        <section className="border-t bg-card">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Harmonious CapTable
            </p>
            <h2 className="mt-4 max-w-2xl text-3xl leading-tight sm:text-4xl">
              Know Exactly Who Owns Your Company
            </h2>
            <p className="mt-4 max-w-2xl text-muted-foreground">
              Control how your private shares move. Verify ownership, document exposure and maintain
              the record. Already on Carta or Pulley? Your history comes with you — export the file,
              we recognise the format, and you approve every row before it is recorded.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild>
                <Link to="/cap-table-management" search={{ move: "carta" }}>
                  Move from Carta
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/cap-table-management" search={{ move: "pulley" }}>
                  Move from Pulley
                </Link>
              </Button>
              <Link
                to="/cap-table-management"
                className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                See Harmonious CapTable →
              </Link>
            </div>
          </div>
        </section>

        {/* Investor journey */}
        <section className="border-y bg-secondary/50">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
              The investor journey
            </p>
            <h2 className="mt-4 max-w-2xl text-3xl leading-tight sm:text-4xl">
              Six Steps, One Guided Flow
            </h2>
            <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {STEPS.map(([num, title, body]) => (
                <li key={num} className="border-t border-foreground/15 pt-4">
                  <span className="font-mono text-xs text-accent-foreground/70">{num}</span>
                  <h3 className="mt-1 text-lg">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Trust */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl leading-tight sm:text-4xl">
                Built On Trust, Integrity And A Complete Record
              </h2>
              <p className="mt-4 text-muted-foreground">
                Our mission is to foster financial prosperity and harmony for our clients:
                optimising their resources, protecting their assets and helping them reach
                long-term goals through a seamless, secure experience.
              </p>
              <Button asChild className="mt-8" variant="outline">
                <Link to="/about">More about Harmonious</Link>
              </Button>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {[
                ["Encrypted document vault", "Offering materials and signed copies stored privately and filed automatically."],
                ["Access by invitation", "Investors see only the funds and documents they were granted."],
                ["Every action recorded", "Views, signatures, wires and approvals carry a timestamp and an owner."],
                ["Live capital picture", "Committed, in-transit and received capital update as money moves."],
              ].map(([title, body]) => (
                <li key={title} className="rounded-xl border bg-card p-5">
                  <h3 className="text-base">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-primary text-primary-foreground">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-3xl">Ready To Move At The Speed Of The Deal?</h2>
              <p className="mt-2 text-primary-foreground/70">
                Create your account, or sign in to pick up where you left off.
              </p>
            </div>
            <div className="flex gap-3">
              <Button asChild size="lg" variant="secondary">
                <Link to="/contactus" search={{ cta: "schedule_demo", intent: "other" }}>Schedule a Demo</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
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
