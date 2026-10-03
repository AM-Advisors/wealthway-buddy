import { Link, createFileRoute } from "@tanstack/react-router";
import adminImage from "@/assets/site-fund-admin.jpg";
import { OfferingSection } from "@/components/marketing/offering-section";
import { marketingHead } from "@/lib/marketing/seo";

import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/fund-administration")({
  head: () =>
    marketingHead({
      path: "/fund-administration",
      title: "Fund Administration for Private Funds | Harmonious",
      description: "Fund administration from Harmonious: capital and closings, investor onboarding, cap table maintenance, investor reporting, document custody and compliance records.",
      
      breadcrumbs: [{ name: "Home", path: "/" }, { name: "Fund Administration", path: "/fund-administration" }],
      service: { name: "Fund Administration", description: "Administration of private investment funds: investor onboarding, capital activity, reporting and records." },
    }),
  component: FundAdministrationPage,
});

const SERVICES = [
  {
    title: "Capital & Closings",
    body: "Commitments confirmed against the fund's minimum, investor funding coordinated and reconciled on receipt, and closings confirmed once the round is fully funded.",
  },
  {
    title: "Capital Accounts & Statements",
    body: "Each investor's contributions, allocations and balance tracked, with capital account statements included for every fund.",
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
    title: "Regulatory & Deadlines",
    body: "Form D and Blue Sky filings prepared for review, state franchise fees and every deadline on one regulatory calendar.",
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
        <section className="bg-brand-gradient text-brand-white">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <p className="text-xs uppercase tracking-[0.22em] text-brand-teal">Fund administration</p>
            <h1 className="mt-6 max-w-3xl text-4xl leading-[1.1] sm:text-5xl">
              The Quiet Work, Done Properly
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-brand-white/80">
              Formation is the easy day. Administration is every day after it - capital, closings,
              records and the answers your investors ask for.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pt-16">
          <img src={adminImage} alt="A fund manager reviewing investor documents" width={1600} height={1000} loading="lazy" className="aspect-[16/7] w-full rounded-2xl object-cover" />
        </section>

        <OfferingSection />

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
              <Link to="/contactus" search={{ cta: "request_fund_admin", intent: "fund_administration" }}>Request Fund Administration</Link>
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
