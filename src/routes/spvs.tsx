import { Link, createFileRoute } from "@tanstack/react-router";
import { marketingHead } from "@/lib/marketing/seo";

import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/spvs")({
  head: () =>
    marketingHead({
      path: "/spvs",
      title: "SPV Administration — Formation to Wind Down | Harmonious",
      description: "Streamlined SPV formation and administration: entity setup, subscription documents, investor onboarding, funding coordination and reconciliation, reporting and records.",
      
      breadcrumbs: [{ name: "Home", path: "/" }, { name: "SPVs", path: "/spvs" }],
      service: { name: "SPV Administration", description: "Formation coordination and administration of special purpose vehicles." },
    }),
  component: SpvPage,
});

const TIMELINE = [
  ["Step 1", "Tell us the deal", "Target company, allocation, minimum check and the exemption you're relying on."],
  ["Step 2", "Entity formed", "Formation of the SPV is coordinated and the operating agreement prepared for the manager to sign."],
  ["Step 3", "Documents assembled", "Offering memorandum, subscription agreement and wire instructions loaded into the fund."],
  ["Step 4", "Investors invited", "Your list is invited to a private room, onboarding starts and commitments can be signed."],
] as const;

const INCLUDED = [
  "Entity formation and manager onboarding",
  "Operating agreement and subscription documents",
  "Offering memorandum and offering terms page",
  "Private due diligence room with NDA gate",
  "KYC, AML and accreditation on every investor",
  "E-signature with signed copies filed for you",
  "Investor funding instructions, with receipt matched and reconciled",
  "Cap table and investor reporting from first close",
] as const;

function SpvPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main>
        <section className="bg-brand-gradient text-primary-foreground">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <p className="text-xs uppercase tracking-[0.22em] text-accent">
              Streamlined SPV formation and administration
            </p>
            <h1 className="mt-6 max-w-3xl text-4xl leading-[1.1] sm:text-5xl">
              Move At The Speed Of The Deal
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-primary-foreground/75">
              The difference between closing an opportunity and missing it is usually a week of
              paperwork. Rapid entity formation and streamlined investor onboarding remove it.
            </p>
            <Button asChild size="lg" variant="secondary" className="mt-10">
              <Link to="/contactus" search={{ cta: "start_spv", intent: "spv" }}>Start an SPV</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-3xl leading-tight sm:text-4xl">From Deal To Commitments In A Day</h2>
          <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {TIMELINE.map(([when, title, body]) => (
              <li key={when} className="border-t-2 border-accent pt-4">
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {when}
                </span>
                <h3 className="mt-2 text-lg">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-y bg-secondary/50">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl leading-tight sm:text-4xl">What's Included</h2>
              <p className="mt-4 text-muted-foreground">
                Every SPV arrives investor-ready. Your counsel can tailor the documents before
                anything is signed.
              </p>
            </div>
            <ul className="grid gap-3">
              {INCLUDED.map((item) => (
                <li key={item} className="flex gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
                  <span aria-hidden className="text-accent-foreground">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl">Have a deal closing this week?</h2>
            <p className="mt-2 text-muted-foreground">
              Create your account and we'll take the entity from there.
            </p>
          </div>
          <Button asChild size="lg">
            <Link to="/contactus" search={{ cta: "start_spv", intent: "spv" }}>Talk to an Administrator</Link>
          </Button>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
