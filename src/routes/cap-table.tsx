import { useState } from "react";

import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { getPublicCapPlans } from "@/lib/captable-leads.functions";

import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  CapTableRequestDialog,
  type CapRequestProvider,
} from "@/components/cap-table-request-dialog";

export const Route = createFileRoute("/cap-table")({
  head: () => ({
    meta: [
      { title: "Harmonious CapTable — Know Exactly Who Owns Your Company" },
      {
        name: "description",
        content:
          "Move your cap table off Carta or Pulley without losing your history. Ownership, employee equity, investors, fundraising, secondaries and a complete audit record in one place.",
      },
      { property: "og:title", content: "Harmonious CapTable — Know Exactly Who Owns Your Company" },
      {
        property: "og:description",
        content:
          "Bring your Carta or Pulley records across, verify ownership, control how shares move and keep the record straight.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://onboard.harmonious.co/og-harmonious.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://onboard.harmonious.co/og-harmonious.jpg" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { move?: CapRequestProvider } => {
    const move = String(search["move"] ?? "");
    return ["carta", "pulley", "angellist", "spreadsheet", "none", "other"].includes(move)
      ? { move: move as CapRequestProvider }
      : {};
  },
  component: CapTableLanding,
});

const MIGRATION_STEPS = [
  [
    "01",
    "Export from where you are",
    "Download your stakeholder, security and transaction files from Carta, Pulley, AngelList or your own spreadsheet. No account access is asked for.",
  ],
  [
    "02",
    "We recognise the format",
    "The file is read, the provider is detected from its column headings and each column is mapped to the right field. Anything unclear is flagged rather than guessed.",
  ],
  [
    "03",
    "You approve every row",
    "Review the mapped rows side by side with what they will become. Nothing is recorded against your company until you say so — and a concierge review is available if you would rather we walked it with you.",
  ],
] as const;

const COVERAGE = [
  ["Cap table", "Every class, series and instrument: common, preferred, options, warrants, SAFEs and convertible notes, outstanding and fully diluted."],
  ["Employee equity", "Grants, vesting schedules, exercises and an employee view of what is vested and what is worth exercising."],
  ["Investor portal", "Each investor sees only their own holdings, documents and transactions, under permissions you set."],
  ["Fundraising", "Priced rounds, SAFEs, convertible notes and direct investments modelled and then recorded."],
  ["Secondary transactions", "Transfers with right-of-first-refusal, board consent and closing steps, so private shares only move the way you allow."],
  ["SPVs and exposure", "Funds, SPVs and advisers declare the positions they hold; you verify them against your own register."],
] as const;

const RECORD = [
  ["Verify ownership", "Claimed positions are compared with your register and either verified, adjusted, queried or disputed — with the ownership chain shown in full."],
  ["Document exposure", "Every SPV, nominee and feeder in your holder base is recorded, with who sits behind it."],
  ["Maintain the record", "Certificates, documents and an append-only audit history: who changed what, when, and what it was before."],
] as const;

function CapTableLanding() {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<CapRequestProvider>("carta");
  const plans = useQuery({ queryKey: ["public-cap-plans"], queryFn: () => getPublicCapPlans() });

  function ask(next: CapRequestProvider) {
    setProvider(next);
    setOpen(true);
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main>
        {/* Hero */}
        <section className="bg-brand-gradient text-primary-foreground">
          <div className="mx-auto max-w-6xl px-4 py-20 lg:py-28">
            <p className="text-xs uppercase tracking-[0.22em] text-accent">Harmonious CapTable</p>
            <h1 className="mt-6 max-w-3xl text-4xl leading-[1.1] sm:text-5xl lg:text-6xl">
              Know Exactly Who Owns Your Company
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-primary-foreground/75">
              Control how your private shares move. Verify ownership, document exposure and maintain
              the record — the ownership operating system for private companies, not simply a cap
              table.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Button size="lg" variant="secondary" onClick={() => ask("carta")}>
                Move from Carta
              </Button>
              <Button size="lg" variant="secondary" onClick={() => ask("pulley")}>
                Move from Pulley
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                onClick={() => ask("none")}
              >
                Start fresh
              </Button>
            </div>
            <p className="mt-6 text-sm text-primary-foreground/60">
              Your history comes with you.
            </p>
          </div>
        </section>

        {/* Migration */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="max-w-2xl text-3xl leading-tight sm:text-4xl">Your History Comes With You</h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Moving providers should not cost you your record. Carta, Pulley, AngelList and plain
            spreadsheets are all recognised from the file you already hold.
          </p>
          <ol className="mt-12 grid gap-8 md:grid-cols-3">
            {MIGRATION_STEPS.map(([num, title, body]) => (
              <li key={num} className="border-t border-foreground/15 pt-4">
                <span className="font-mono text-xs text-accent-foreground/70">{num}</span>
                <h3 className="mt-1 text-lg">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button onClick={() => ask("carta")}>Move from Carta</Button>
            <Button variant="outline" onClick={() => ask("pulley")}>
              Move from Pulley
            </Button>
          </div>
        </section>

        {/* Coverage */}
        <section className="border-y bg-secondary/50">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <h2 className="max-w-2xl text-3xl leading-tight sm:text-4xl">
              Everything Ownership Touches, In One Record
            </h2>
            <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {COVERAGE.map(([title, body]) => (
                <article key={title} className="rounded-xl border bg-card p-6">
                  <h3 className="text-lg">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Ownership record */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="max-w-2xl text-3xl leading-tight sm:text-4xl">
            Verify Ownership. Document Exposure. Maintain The Record.
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {RECORD.map(([title, body]) => (
              <article key={title} className="rounded-xl border bg-card p-6">
                <h3 className="text-lg">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
          <p className="mt-8 max-w-3xl text-sm text-muted-foreground">
            Harmonious keeps the record and administers the workflow. Every ownership decision — who
            may hold shares, what a transfer is worth, what is approved — stays with the company and
            its own counsel.
          </p>
        </section>

        {/* Plans */}
        <section className="border-y bg-secondary/50">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <h2 className="max-w-2xl text-3xl leading-tight sm:text-4xl">Plans That Grow With You</h2>
            <p className="mt-4 max-w-2xl text-muted-foreground">
              From a first SPV to a multi-entity group. Your plan and its fees are set out in your
              statement of work before anything starts.
            </p>
            <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {(plans.data ?? []).map((plan) => (
                <article key={plan.key} className="flex flex-col rounded-xl border bg-card p-6">
                  <h3 className="text-lg">{plan.name}</h3>
                  <p className="mt-2 flex-1 text-sm text-muted-foreground">{plan.description}</p>
                </article>
              ))}
            </div>
            <Button className="mt-10" onClick={() => ask("other")}>
              Talk to us about a plan
            </Button>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="bg-primary text-primary-foreground">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <h2 className="max-w-2xl text-3xl leading-tight sm:text-4xl">
              Bring Your Cap Table Across
            </h2>
            <p className="mt-4 max-w-2xl text-primary-foreground/75">
              Tell us where your records live today. We confirm the details with you and open your
              workspace — you review every row before it is recorded.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Button size="lg" variant="secondary" onClick={() => ask("carta")}>
                Move from Carta
              </Button>
              <Button size="lg" variant="secondary" onClick={() => ask("pulley")}>
                Move from Pulley
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                onClick={() => ask("none")}
              >
                Start fresh
              </Button>
            </div>
            <p className="mt-6 text-sm text-primary-foreground/60">
              Already have an account?{" "}
              <Link to="/auth" className="underline underline-offset-4">
                Sign in
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
      <CapTableRequestDialog open={open} provider={provider} onOpenChange={setOpen} />
    </div>
  );
}
