import { Link, createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/fund-administration")({
  head: () => ({
    meta: [
      { title: "Fund Administration — Harmonious" },
      {
        name: "description",
        content:
          "Cap table, capital calls, closings, wire reconciliation, investor reporting and a complete audit trail, administered on the Harmonious platform.",
      },
      { property: "og:title", content: "Fund Administration — Harmonious" },
      {
        property: "og:description",
        content:
          "Ongoing administration for SPVs and funds: capital, closings, reporting and the record behind them.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FundAdministrationPage,
});

const SERVICES = [
  {
    title: "Capital & Closings",
    body: "Commitments confirmed against the fund's minimum, wire and ACH tracked from submission to receipt, and closings confirmed once the round is fully funded.",
  },
  {
    title: "Cap Table Maintenance",
    body: "Shares, share class and ownership percentage per investor, with per-investor fee overrides and a change log showing who edited what and when.",
  },
  {
    title: "Investor Reporting",
    body: "Each investor sees their commitment, received capital, ownership and portfolio value, and receives an ownership update whenever their position changes.",
  },
  {
    title: "Document Custody",
    body: "Offering documents versioned, signed copies hashed and stored privately, and every file filed into your document vault with a timestamp.",
  },
  {
    title: "Compliance Record",
    body: "Identity, screening and accreditation decisions kept with the application, alongside acknowledgements of the wire instructions the investor actually saw.",
  },
  {
    title: "Oversight & Alerts",
    body: "Manager alerts on signatures, uploads, NDA acceptances and wires, plus funnel reporting that shows exactly where investors stall.",
  },
] as const;

function FundAdministrationPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main>
        <section className="bg-brand-gradient text-primary-foreground">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <p className="text-xs uppercase tracking-[0.22em] text-accent">Fund administration</p>
            <h1 className="mt-6 max-w-3xl text-4xl leading-[1.1] sm:text-5xl">
              The Quiet Work, Done Properly
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-primary-foreground/75">
              Formation is the easy day. Administration is every day after it — capital, closings,
              records and the answers your investors ask for.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => (
              <article key={s.title} className="rounded-xl border bg-card p-7">
                <h2 className="text-lg">{s.title}</h2>
                <p className="mt-3 text-sm text-muted-foreground">{s.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y bg-secondary/50">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl leading-tight sm:text-4xl">
                One Record, Not Five Spreadsheets
              </h2>
              <p className="mt-4 text-muted-foreground">
                Commitments, signatures, wires and ownership all derive from the same data, so the
                cap table, the funding dashboard and the investor's portal can never disagree.
              </p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {[
                ["Live totals", "Committed, in transit and received capital update as money moves."],
                ["Scoped access", "Managers see their assigned funds; investors see only their own."],
                ["Full history", "Append-only logs for ownership, documents and approvals."],
                ["Email that lands", "Branded, tracked investor and manager notifications."],
              ].map(([title, body]) => (
                <li key={title} className="rounded-xl border bg-card p-5">
                  <h3 className="text-base">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl">Bring your existing fund across.</h2>
          <div className="flex gap-3">
            <Button asChild size="lg">
              <Link to="/auth/register">Get started</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/platform">See the platform</Link>
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
