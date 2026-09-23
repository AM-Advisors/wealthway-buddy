import { Link, createFileRoute } from "@tanstack/react-router";
import { marketingHead } from "@/lib/marketing/seo";

import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/platform")({
  head: () =>
    marketingHead({
      path: "/platform",
      title: "The Harmonious Platform — Onboarding, Administration & Reporting",
      description: "Investor onboarding, identity and AML checks, accreditation, deal rooms, e-signature, investor funding workflows, cap tables and reporting in one platform.",
      
      breadcrumbs: [{ name: "Home", path: "/" }, { name: "Platform", path: "/platform" }],
      
    }),
  component: PlatformPage,
});

const MODULES = [
  {
    title: "Investor Onboarding",
    body: "A resumable application that collects legal details, identity documents and tax classification, then walks each investor through screening and accreditation without email ping-pong.",
  },
  {
    title: "Identity & AML Screening",
    body: "Government ID and proof of address capture, source of funds and wealth questions, PEP and sanctions declarations, with reviewer approval before anyone reaches the wire step.",
  },
  {
    title: "Accreditation, 506(b) And 506(c)",
    body: "The questions change with the exemption: self-certification for 506(b), third-party verification evidence for 506(c). Nothing funds until accreditation is approved.",
  },
  {
    title: "Due Diligence Rooms",
    body: "An NDA-gated room per fund with categorised, versioned documents, a pitch deck viewer, offering terms, a timeline and a question board — plus a record of who opened what.",
  },
  {
    title: "Documents & E-Signature",
    body: "Offering memorandum, subscription agreement and operating agreement issued for signature, with signed copies stored privately and filed to your document vault automatically.",
  },
  {
    title: "Investor Funding Workflows",
    body: "Fund bank details kept in restricted storage, acknowledged by the investor before funding, then wire confirmations reviewed and matched to received capital.",
  },
  {
    title: "Cap Table & Portfolio Value",
    body: "Shares, ownership percentage and value per share derived from confirmed commitments and received funds, visible to the sponsor and to each investor for their own position.",
  },
  {
    title: "Reporting & Activity Trail",
    body: "Funnel and drop-off reporting, an activity log for every manager and admin action, and email alerts when an investor signs, uploads or wires.",
  },
] as const;

const AUDIENCES = [
  {
    who: "Sponsors and fund managers",
    body: "Assigned funds, an investor review board, wire approvals, diligence rooms and document permissions — scoped so each manager only sees their own funds.",
  },
  {
    who: "Investors",
    body: "One portal with their application status, documents to sign, assigned questions, messages, wire status and their live ownership.",
  },
  {
    who: "Administrators",
    body: "Fund setup, investor directory, access control, email delivery and a full audit trail across every fund on the platform.",
  },
] as const;

function PlatformPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main>
        <section className="bg-brand-gradient text-primary-foreground">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <p className="text-xs uppercase tracking-[0.22em] text-accent">The platform</p>
            <h1 className="mt-6 max-w-3xl text-4xl leading-[1.1] sm:text-5xl">
              Everything Between The Term Sheet And The Final Close
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-primary-foreground/75">
              Harmonious replaces the spreadsheet, the shared drive and the signature chase with a
              single record that sponsors, managers and investors all work from.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid gap-6 md:grid-cols-2">
            {MODULES.map((m) => (
              <article key={m.title} className="rounded-xl border bg-card p-7">
                <h2 className="text-xl">{m.title}</h2>
                <p className="mt-3 text-sm text-muted-foreground">{m.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y bg-secondary/50">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <h2 className="text-3xl leading-tight sm:text-4xl">Built For Three Sets Of Hands</h2>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {AUDIENCES.map((a) => (
                <article key={a.who} className="rounded-xl border bg-card p-7">
                  <h3 className="text-lg">{a.who}</h3>
                  <p className="mt-3 text-sm text-muted-foreground">{a.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl">See it with your own fund.</h2>
          <div className="flex gap-3">
            <Button asChild size="lg">
              <Link to="/contactus" search={{ cta: "schedule_demo", intent: "other" }}>Schedule a Demo</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/spvs">SPV Administration</Link>
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
